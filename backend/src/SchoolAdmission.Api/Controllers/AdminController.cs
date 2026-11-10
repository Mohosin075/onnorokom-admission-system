using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SchoolAdmission.Api.Portal;
using SchoolAdmission.Application.DTOs;
using SchoolAdmission.Application.Interfaces;
using SchoolAdmission.Domain.Entities;
using SchoolAdmission.Domain.Enums;
using SchoolAdmission.Infrastructure.Persistence;

namespace SchoolAdmission.Api.Controllers;

[ApiController, Authorize(Roles = "Admin"), Route("admin")]
public class AdminController(ApplicationDbContext db, IClassService classes, IConfiguration config, PaymentGateway gateway) : ControllerBase
{
    public record ClassInput([Required, MaxLength(200)] string Name, [Range(1, 100000)] int TotalSeats, [Range(10, 500000)] decimal Fee);
    public record ReviewInput([Required, RegularExpression("^(Approved|Rejected)$")] string Status, [Required, RegularExpression("^[A-F0-9]{64}$")] string Sha256, [MaxLength(1000)] string? Note);

    [HttpGet("overview")]
    public async Task<IActionResult> Overview(CancellationToken ct)
    {
        var now = DateTime.UtcNow;
        return Ok(new {
            students = await db.Users.CountAsync(x => x.Role == "Student", ct),
            applications = await db.Holds.CountAsync(ct),
            confirmed = await db.Holds.CountAsync(x => x.Status == HoldStatus.CONFIRMED, ct),
            activeHolds = await db.Holds.CountAsync(x => x.Status == HoldStatus.HELD && x.ExpiresAtUtc > now, ct),
            revenue = await db.Payments.Where(x => x.Status == "Paid").SumAsync(x => (decimal?)x.Amount, ct) ?? 0,
            pendingDocuments = await db.Documents.CountAsync(x => x.ReviewStatus == "Pending", ct),
            failedNotifications = await db.Notifications.CountAsync(x => x.SentAt == null && x.Attempts > 0, ct),
            refundRequired = await db.Payments.CountAsync(x => x.Status == "RefundRequired", ct),
            integrations = new { stripe = gateway.Configured, email = !string.IsNullOrWhiteSpace(config["Smtp:Host"]),
                sms = !string.IsNullOrWhiteSpace(config["Sms:ApiKey"]), institution = config["Portal:InstitutionName"] }
        });
    }

    [HttpPost("classes")]
    public async Task<IActionResult> CreateClass(ClassInput input, CancellationToken ct)
    {
        if (decimal.Round(input.Fee, 2) != input.Fee) return BadRequest(new { message = "Fee can have at most two decimal places." });
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var cls = await classes.CreateClassAsync(new CreateClassRequest(input.Name, input.TotalSeats), ct);
        db.Fees.Add(new AdmissionFee { ClassId = cls.Id, Amount = input.Fee });
        PortalSecurity.Audit(db, User.UserId(), "ClassCreated", cls.Id);
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
        return Created("/classes/" + cls.Id, cls);
    }

    [HttpGet("applications")]
    public async Task<IActionResult> Applications([FromQuery] string? search, [FromQuery] string? status, [FromQuery] string? classId,
        [FromQuery] int page = 1, [FromQuery] int pageSize = 25, CancellationToken ct = default)
    {
        page = Math.Max(1, page); pageSize = Math.Clamp(pageSize, 1, 100);
        var now = DateTime.UtcNow;
        var query = from h in db.Holds.AsNoTracking()
                    join u in db.Users on h.StudentId equals u.BirthRegistration
                    join c in db.Classes on h.ClassId equals c.Id
                    select new { h.Id, h.ClassId, ClassName = c.Name, u.FullName, u.Email, u.Phone, BirthRegistration = h.StudentId,
                        Status = h.Status == HoldStatus.CONFIRMED ? "CONFIRMED" : h.Status == HoldStatus.CANCELLED ? "CANCELLED" : h.Status == HoldStatus.EXPIRED || h.ExpiresAtUtc <= now ? "EXPIRED" : "HELD", h.CreatedAtUtc, h.ExpiresAtUtc };
        if (!string.IsNullOrWhiteSpace(search)) { var s = search.Trim().ToLower(); query = query.Where(x => x.FullName.ToLower().Contains(s) || x.Email.Contains(s) || x.BirthRegistration.Contains(s) || x.Id.Contains(s)); }
        // Status is an effective SQL CASE expression, so expired holds remain searchable before the worker runs.
        if (status == "EXPIRED") query = query.Where(x => x.ExpiresAtUtc <= now && (x.Status == "HELD" || x.Status == "EXPIRED"));
        else if (!string.IsNullOrWhiteSpace(status)) query = query.Where(x => x.Status == status);
        if (!string.IsNullOrWhiteSpace(classId)) query = query.Where(x => x.ClassId == classId);
        var count = await query.CountAsync(ct);
        return Ok(new { total = count, page, pageSize, items = await query.OrderByDescending(x => x.CreatedAtUtc).Skip((page - 1) * pageSize).Take(pageSize).ToListAsync(ct) });
    }

    [HttpGet("documents")]
    public async Task<IActionResult> Documents([FromQuery] string status = "Pending", [FromQuery] int page = 1, CancellationToken ct = default)
    {
        var query = from d in db.Documents.AsNoTracking() join u in db.Users on d.UserId equals u.Id
                    where d.ReviewStatus == status select new { d.Id, d.Kind, d.OriginalName, d.ReviewStatus, d.Sha256, d.CreatedAt, u.FullName, u.Email, u.BirthRegistration };
        return Ok(new { total = await query.CountAsync(ct), items = await query.OrderBy(x => x.CreatedAt).Skip((Math.Max(1,page)-1)*25).Take(25).ToListAsync(ct) });
    }

    [HttpPut("documents/{id}/review")]
    public async Task<IActionResult> Review(string id, ReviewInput input, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var doc = await db.Documents.FromSqlInterpolated($"SELECT * FROM \"Documents\" WHERE \"Id\"={id} FOR UPDATE").SingleOrDefaultAsync(ct); if (doc == null) return NotFound();
        if (doc.Sha256 != input.Sha256) return Conflict(new { message = "The applicant replaced this document. Refresh the queue and inspect the new file before reviewing it." });
        if (input.Status == "Rejected" && string.IsNullOrWhiteSpace(input.Note)) return BadRequest(new { message = "Explain why the document was rejected." });
        var user = await db.Users.SingleAsync(x => x.Id == doc.UserId, ct);
        doc.ReviewStatus = input.Status; doc.ReviewNote = input.Note?.Trim();
        PortalSecurity.Audit(db, User.UserId(), "Document" + input.Status, id);
        db.Notifications.Add(new NotificationMessage { UserId = user.Id, Recipient = user.Email, Subject = "Admission document reviewed", Body = $"Your {doc.Kind} is {input.Status}. {input.Note}" });
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct); return NoContent();
    }

    [HttpGet("notifications")]
    public async Task<IActionResult> Notifications(CancellationToken ct) => Ok(await db.Notifications.AsNoTracking().OrderByDescending(x => x.CreatedAt).Take(100)
        .Select(x => new { x.Id, x.Channel, x.Subject, x.Attempts, x.SentAt, x.LastError, x.CreatedAt }).ToListAsync(ct));

    [HttpPost("notifications/{id}/retry")]
    public async Task<IActionResult> Retry(string id, CancellationToken ct)
    {
        var message = await db.Notifications.SingleOrDefaultAsync(x => x.Id == id && x.SentAt == null, ct); if (message == null) return NotFound();
        message.Attempts = 0; message.NextAttemptAt = DateTime.UtcNow; PortalSecurity.Audit(db, User.UserId(), "NotificationRetry", id);
        await db.SaveChangesAsync(ct); return NoContent();
    }

    [HttpGet("payments")]
    public async Task<IActionResult> Payments(CancellationToken ct) => Ok(await db.Payments.AsNoTracking().OrderByDescending(x => x.CreatedAt).Take(100)
        .Select(x => new { x.Id, x.HoldId, x.Amount, x.Currency, x.Status, x.CreatedAt, x.PaidAt, x.BankTransactionId }).ToListAsync(ct));

    [HttpPost("payments/{id}/retry-refund")]
    public async Task<IActionResult> Refund(string id, CancellationToken ct)
    {
        var payment = await db.Payments.SingleOrDefaultAsync(x => x.Id == id && x.Status == "RefundRequired", ct); if (payment == null) return NotFound();
        await gateway.Refund(payment.Id, payment.BankTransactionId!, ct); payment.Status = "Refunded";
        PortalSecurity.Audit(db, User.UserId(), "RefundCompleted", id); await db.SaveChangesAsync(ct); return NoContent();
    }

    [HttpGet("audit")]
    public async Task<IActionResult> Audit(CancellationToken ct) => Ok(await db.Audit.AsNoTracking().OrderByDescending(x => x.CreatedAt).Take(100).ToListAsync(ct));
}
