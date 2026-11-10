using System.Globalization;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using SchoolAdmission.Domain.Entities;

namespace SchoolAdmission.Api.Portal;

public class PaymentGateway(IHttpClientFactory clients, IConfiguration config)
{
    public bool Configured => config["Stripe:SecretKey"]?.StartsWith("sk_live_") == true
        && !string.IsNullOrWhiteSpace(config["Stripe:WebhookSecret"]);

    private async Task<JsonDocument> Request(HttpMethod method, string path, Dictionary<string, string>? form, string? idempotency, CancellationToken ct)
    {
        if (!Configured) throw new InvalidOperationException("Live Stripe payments have not been configured by the institution.");
        using var request = new HttpRequestMessage(method, "https://api.stripe.com/v1/" + path);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", config["Stripe:SecretKey"]);
        request.Headers.Add("Stripe-Version", "2024-06-20");
        if (idempotency != null) request.Headers.Add("Idempotency-Key", idempotency);
        if (form != null) request.Content = new FormUrlEncodedContent(form);
        using var response = await clients.CreateClient().SendAsync(request, ct);
        if (!response.IsSuccessStatusCode) throw new HttpRequestException("Stripe could not process the request. Retry or contact admissions.");
        return JsonDocument.Parse(await response.Content.ReadAsStringAsync(ct));
    }

    public async Task<(string Id, string Url)> Checkout(AdmissionPayment payment, PortalUser user, string className, CancellationToken ct)
    {
        var publicUrl = config["Portal:PublicUrl"]!.TrimEnd('/');
        using var result = await Request(HttpMethod.Post, "checkout/sessions", new() {
            ["mode"] = "payment", ["customer_email"] = user.Email,
            ["client_reference_id"] = payment.Id, ["metadata[paymentId]"] = payment.Id,
            ["payment_intent_data[metadata][paymentId]"] = payment.Id,
            ["line_items[0][price_data][currency]"] = "bdt",
            ["line_items[0][price_data][unit_amount]"] = ((long)(payment.Amount * 100)).ToString(CultureInfo.InvariantCulture),
            ["line_items[0][price_data][product_data][name]"] = "Admission: " + className,
            ["line_items[0][quantity]"] = "1",
            ["expires_at"] = new DateTimeOffset(payment.CreatedAt.AddMinutes(30)).ToUnixTimeSeconds().ToString(),
            ["success_url"] = publicUrl + "/?payment=processing",
            ["cancel_url"] = publicUrl + "/?payment=cancelled"
        }, "checkout-" + payment.Id, ct);
        return (result.RootElement.GetProperty("id").GetString()!, result.RootElement.GetProperty("url").GetString()!);
    }

    public Task<JsonDocument> Session(string id, CancellationToken ct) => Request(HttpMethod.Get, "checkout/sessions/" + Uri.EscapeDataString(id), null, null, ct);
    public async Task Refund(string paymentId, string intent, CancellationToken ct)
    {
        using var result = await Request(HttpMethod.Post, "refunds", new() { ["payment_intent"] = intent, ["reason"] = "requested_by_customer" }, "expired-refund-" + paymentId, ct);
        if (result.RootElement.GetProperty("status").GetString() != "succeeded") throw new HttpRequestException("Refund is awaiting provider completion.");
    }

    public bool VerifySignature(string payload, string signature)
    {
        var secret = config["Stripe:WebhookSecret"];
        if (string.IsNullOrWhiteSpace(secret)) return false;
        var parts = signature.Split(',').Select(x => x.Split('=', 2)).Where(x => x.Length == 2).ToArray();
        var timestamp = parts.FirstOrDefault(x => x[0] == "t")?[1];
        if (!long.TryParse(timestamp, out var time) || Math.Abs(DateTimeOffset.UtcNow.ToUnixTimeSeconds() - time) > 300) return false;
        var expected = HMACSHA256.HashData(Encoding.UTF8.GetBytes(secret), Encoding.UTF8.GetBytes(timestamp + "." + payload));
        foreach (var part in parts.Where(x => x[0] == "v1"))
        {
            try { if (CryptographicOperations.FixedTimeEquals(expected, Convert.FromHexString(part[1]))) return true; }
            catch (FormatException) { }
        }
        return false;
    }
}
