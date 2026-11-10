using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using FluentAssertions;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using SchoolAdmission.Domain.Entities;
using SchoolAdmission.Domain.Enums;
using SchoolAdmission.Infrastructure.Persistence;

namespace SchoolAdmission.Tests;

public class StripeFlowTests(PostgresFixture database) : IClassFixture<PostgresFixture>
{
    private const string Secret = "whsec_isolated_test_only";

    // Network responses are substituted only inside these tests. No Stripe or application database receives fabricated transactions.
    private sealed class StripeTransport(string paymentId, long amount) : HttpMessageHandler, IHttpClientFactory
    {
        public int Refunds { get; private set; }
        public HttpClient CreateClient(string name) => new(this, disposeHandler: false);
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            if (request.RequestUri!.AbsolutePath.EndsWith("/refunds")) { Refunds++; return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent("{\"status\":\"succeeded\"}") }); }
            var payload = JsonSerializer.Serialize(new { id = "cs_" + paymentId, client_reference_id = paymentId, payment_status = "paid", amount_total = amount, currency = "bdt", livemode = true, payment_intent = "pi_" + paymentId });
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(payload) });
        }
    }

    private static async Task<HttpResponseMessage> Callback(HttpClient client, string paymentId)
    {
        var body = JsonSerializer.Serialize(new { type = "checkout.session.completed", livemode = true, data = new { @object = new { id = "cs_" + paymentId } } });
        var timestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        var signature = Convert.ToHexString(HMACSHA256.HashData(Encoding.UTF8.GetBytes(Secret), Encoding.UTF8.GetBytes(timestamp + "." + body)));
        using var request = new HttpRequestMessage(HttpMethod.Post, "/payments/stripe/webhook") { Content = new StringContent(body, Encoding.UTF8, "application/json") };
        request.Headers.Add("Stripe-Signature", $"t={timestamp},v1={signature}");
        return await client.SendAsync(request);
    }

    [PostgresFact]
    public async Task VerifiedPaymentConfirmsExactlyOnce_AndQueuesNotificationsAtomically()
    {
        await RunPayment(expired: false, mismatch: false);
    }

    [PostgresFact]
    public async Task LatePaymentRefundsWithoutAllocatingAnExpiredSeat()
    {
        await RunPayment(expired: true, mismatch: false);
    }

    [PostgresFact]
    public async Task WrongAmountNeverConfirmsAdmission()
    {
        await RunPayment(expired: false, mismatch: true);
    }

    private async Task RunPayment(bool expired, bool mismatch)
    {
        var paymentId = Guid.NewGuid().ToString("N");
        using var transport = new StripeTransport(paymentId, mismatch ? 1 : 50000);
        using var source = database.CreateFactory(2100);
        using var factory = source.WithWebHostBuilder(builder => {
            builder.ConfigureAppConfiguration((_, c) => c.AddInMemoryCollection(new Dictionary<string,string?> {
                ["Stripe:SecretKey"] = "sk_live_isolated_test_only", ["Stripe:WebhookSecret"] = Secret }));
            builder.ConfigureServices(services => services.AddSingleton<IHttpClientFactory>(transport));
        });
        using var client = factory.CreateClient(new WebApplicationFactoryClientOptions { BaseAddress = new Uri("https://localhost") });
        string holdId;
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            var user = new PortalUser { Email = Guid.NewGuid()+"@example.invalid", BirthRegistration = "2026"+RandomNumberGenerator.GetInt32(100000000,999999999).ToString("0000000000000"), EmailVerified = true, Phone = "01700000000" };
            db.Users.Add(user); var cls = new ClassRoom("c_"+Guid.NewGuid().ToString("N"),"Isolated Stripe flow",1); db.Classes.Add(cls);
            var hold = new SeatHold("h_"+Guid.NewGuid().ToString("N"),cls.Id,user.BirthRegistration,2100); holdId = hold.Id; db.Holds.Add(hold);
            if (expired) db.Entry(hold).Property(x=>x.ExpiresAtUtc).CurrentValue = DateTime.UtcNow.AddSeconds(-1);
            db.Payments.Add(new AdmissionPayment { Id=paymentId, HoldId=hold.Id, UserId=user.Id, Amount=500, ValidationId="cs_" + paymentId });
            await db.SaveChangesAsync();
        }
        using var first = await Callback(client, paymentId);
        first.StatusCode.Should().Be(mismatch ? HttpStatusCode.BadRequest : HttpStatusCode.OK);
        if (!mismatch) { using var duplicate = await Callback(client, paymentId); duplicate.StatusCode.Should().Be(HttpStatusCode.OK); }
        using var read = factory.Services.CreateScope(); var context = read.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var payment = await context.Payments.SingleAsync(x=>x.Id==paymentId); var current = await context.Holds.SingleAsync(x=>x.Id==holdId);
        payment.Status.Should().Be(mismatch ? "Pending" : expired ? "Refunded" : "Paid");
        (current.Status==HoldStatus.CONFIRMED).Should().Be(!mismatch&&!expired);
        (await context.Notifications.CountAsync(x=>x.UserId==payment.UserId)).Should().Be(!mismatch&&!expired?2:0);
        transport.Refunds.Should().Be(expired&&!mismatch?1:0);
    }
}
