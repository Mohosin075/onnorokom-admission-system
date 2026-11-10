using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SchoolAdmission.Api.Portal;
using SchoolAdmission.Domain.Entities;
using SchoolAdmission.Domain.Enums;
using SchoolAdmission.Domain.Exceptions;
using SchoolAdmission.Infrastructure.Persistence;

namespace SchoolAdmission.Api.Controllers;

[ApiController, Route("payments")]
public class PaymentsController(ApplicationDbContext db, PaymentGateway gateway) : ControllerBase
{
    [Authorize, HttpPost("{holdId}/checkout")]
    public async Task<IActionResult> Checkout(string holdId, CancellationToken ct)
    {
        if (!gateway.Configured) return StatusCode(503, new { message = "The institution has not configured live Stripe payments yet." });
        var user = await PortalSecurity.Current(db, User, ct);
        // Class lock serializes checkout with cancellation and other capacity changes.
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var snapshot = await db.Holds.AsNoTracking().SingleOrDefaultAsync(x => x.Id == holdId && x.StudentId == user.BirthRegistration, ct);
        if (snapshot == null) return NotFound();
        var cls = await db.Classes.FromSqlInterpolated($"SELECT * FROM classes WHERE id={snapshot.ClassId} FOR UPDATE").SingleAsync(ct);
        var hold = await db.Holds.FromSqlInterpolated($"SELECT * FROM seat_holds WHERE id={holdId} FOR UPDATE").SingleAsync(ct);
        if (!hold.IsActive(DateTime.UtcNow)) return Conflict(new { message = "This reservation is no longer payable." });
        var payment = await db.Payments.SingleOrDefaultAsync(x => x.HoldId == holdId, ct);
        if (payment != null && payment.Status != "Pending") return Conflict(new { message = "Payment has already been processed." });
        if (payment?.GatewayUrl != null) return Ok(new { url = payment.GatewayUrl });
        if (hold.ExpiresAtUtc < DateTime.UtcNow.AddMinutes(31)) return Conflict(new { message = "Too little reservation time remains to open checkout. Cancel this hold and reserve again." });
        var fee = await db.Fees.SingleOrDefaultAsync(x => x.ClassId == hold.ClassId, ct);
        if (fee == null || fee.Amount <= 0) return Conflict(new { message = "An admission fee has not been set for this class." });
        payment ??= new AdmissionPayment { HoldId = holdId, UserId = user.Id, Amount = fee.Amount };
        if (db.Entry(payment).State == EntityState.Detached) db.Payments.Add(payment);
        // Persist the idempotency key before contacting Stripe, so retries cannot create a second payment.
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
        var checkout = await gateway.Checkout(payment, user, cls.Name, ct);
        payment.ValidationId = checkout.Id; payment.GatewayUrl = checkout.Url;
        await db.SaveChangesAsync(ct);
        return Ok(new { url = checkout.Url });
    }

    [AllowAnonymous, HttpPost("stripe/webhook"), RequestSizeLimit(1_000_000)]
    public async Task<IActionResult> Webhook(CancellationToken ct)
    {
        using var reader = new StreamReader(Request.Body);
        var payload = await reader.ReadToEndAsync(ct);
        if (!gateway.VerifySignature(payload, Request.Headers["Stripe-Signature"].ToString())) return BadRequest(new { message = "Invalid webhook signature." });
        using var evt = JsonDocument.Parse(payload);
        var type = evt.RootElement.GetProperty("type").GetString();
        if (type is not ("checkout.session.completed" or "checkout.session.async_payment_succeeded")) return Ok();
        if (!evt.RootElement.GetProperty("livemode").GetBoolean()) return BadRequest();
        var sessionId = evt.RootElement.GetProperty("data").GetProperty("object").GetProperty("id").GetString()!;
        using var sessionDoc = await gateway.Session(sessionId, ct);
        var session = sessionDoc.RootElement;
        if (session.GetProperty("payment_status").GetString() != "paid") return Ok();
        var paymentId = session.GetProperty("client_reference_id").GetString();
        var snapshot = await db.Payments.AsNoTracking().SingleOrDefaultAsync(x => x.Id == paymentId, ct);
        if (snapshot == null) return BadRequest();
        var holdSnapshot = await db.Holds.AsNoTracking().SingleAsync(x => x.Id == snapshot.HoldId, ct);
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await db.Classes.FromSqlInterpolated($"SELECT * FROM classes WHERE id={holdSnapshot.ClassId} FOR UPDATE").SingleAsync(ct);
        var hold = await db.Holds.FromSqlInterpolated($"SELECT * FROM seat_holds WHERE id={snapshot.HoldId} FOR UPDATE").SingleAsync(ct);
        var payment = await db.Payments.FromSqlInterpolated($"SELECT * FROM \"Payments\" WHERE \"Id\"={snapshot.Id} FOR UPDATE").SingleAsync(ct);
        if (payment.Status is "Paid" or "Refunded") return Ok();
        if (session.GetProperty("amount_total").GetInt64() != (long)(payment.Amount * 100)
            || session.GetProperty("currency").GetString() != "bdt"
            || !session.GetProperty("livemode").GetBoolean()
            || (payment.ValidationId != null && payment.ValidationId != sessionId)) return BadRequest();
        payment.ValidationId = sessionId; payment.BankTransactionId = session.GetProperty("payment_intent").GetString();
        payment.PaidAt = DateTime.UtcNow;
        if (hold.IsActive(DateTime.UtcNow))
        {
            var user = await db.Users.SingleAsync(x => x.Id == payment.UserId, ct);
            hold.Confirm(user.BirthRegistration!, DateTime.UtcNow); payment.Status = "Paid";
            db.Notifications.Add(new NotificationMessage { UserId = user.Id, Recipient = user.Email, Subject = "Admission confirmed", Body = $"Your admission is confirmed. Application: {hold.Id}. Payment reference: {payment.Id}. Download your receipt and admission card from your account." });
            if (!string.IsNullOrWhiteSpace(user.Phone)) db.Notifications.Add(new NotificationMessage { UserId = user.Id, Channel = "Sms", Recipient = user.Phone, Subject = "Admission confirmed", Body = $"Admission confirmed. Application: {hold.Id}. Sign in to download your receipt." });
        }
        else payment.Status = "RefundRequired";
        PortalSecurity.Audit(db, payment.UserId, payment.Status == "Paid" ? "PaymentConfirmed" : "LatePaymentRefundRequired", payment.Id);
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
        if (payment.Status == "RefundRequired")
        {
            await gateway.Refund(payment.Id, payment.BankTransactionId!, ct);
            payment.Status = "Refunded"; await db.SaveChangesAsync(ct);
        }
        return Ok();
    }

    [Authorize, HttpGet("mine")]
    public async Task<IActionResult> Mine(CancellationToken ct) => Ok(await db.Payments.AsNoTracking().Where(x => x.UserId == User.UserId())
        .Select(x => new { x.Id, x.HoldId, x.Amount, x.Currency, x.Status, x.PaidAt }).ToListAsync(ct));
}
