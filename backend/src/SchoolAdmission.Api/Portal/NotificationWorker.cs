using System.Net;
using System.Net.Mail;
using Microsoft.EntityFrameworkCore;
using SchoolAdmission.Infrastructure.Persistence;

namespace SchoolAdmission.Api.Portal;

// Persistent outbox. Provider failures remain visible and retry with backoff; nothing is marked sent without delivery acceptance.
public class NotificationWorker(IServiceScopeFactory scopes, IConfiguration config, IHttpClientFactory clients, ILogger<NotificationWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = scopes.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
                await using var tx = await db.Database.BeginTransactionAsync(stoppingToken);
                var messages = await db.Notifications.FromSqlRaw("SELECT * FROM \"Notifications\" WHERE \"SentAt\" IS NULL AND \"NextAttemptAt\" <= now() AND \"Attempts\" < 8 ORDER BY \"CreatedAt\" LIMIT 10 FOR UPDATE SKIP LOCKED").ToListAsync(stoppingToken);
                foreach (var message in messages)
                {
                    try
                    {
                        if (message.Channel == "Email")
                        {
                            if (string.IsNullOrWhiteSpace(config["Smtp:Host"])) throw new InvalidOperationException("Email provider not configured");
                            using var smtp = new SmtpClient(config["Smtp:Host"], config.GetValue("Smtp:Port", 587)) {
                                EnableSsl = true, Credentials = new NetworkCredential(config["Smtp:Username"], config["Smtp:Password"]), Timeout = 15000 };
                            using var mail = new MailMessage(config["Smtp:From"]!, message.Recipient, message.Subject, message.Body);
                            await smtp.SendMailAsync(mail, stoppingToken);
                        }
                        else
                        {
                            var key = config["Sms:ApiKey"]; var sender = config["Sms:SenderId"];
                            if (string.IsNullOrWhiteSpace(key) || string.IsNullOrWhiteSpace(sender)) throw new InvalidOperationException("SMS provider not configured");
                            var number = message.Recipient.TrimStart('+');
                            if (number.StartsWith('0')) number = "88" + number;
                            using var response = await clients.CreateClient().PostAsync("https://bulksmsbd.net/api/smsapi", new FormUrlEncodedContent(new Dictionary<string,string> {
                                ["api_key"] = key, ["senderid"] = sender, ["number"] = number, ["message"] = message.Body, ["type"] = "text" }), stoppingToken);
                            response.EnsureSuccessStatusCode();
                            using var json = System.Text.Json.JsonDocument.Parse(await response.Content.ReadAsStringAsync(stoppingToken));
                            if (!json.RootElement.TryGetProperty("response_code", out var code) || code.ToString() != "202") throw new InvalidOperationException("SMS provider rejected delivery");
                        }
                        message.SentAt = DateTime.UtcNow; message.LastError = null;
                        // Remove one-time links from the queue after successful delivery.
                        if (message.Subject.Contains("account")) message.Body = "Account email delivered.";
                    }
                    catch (Exception ex) when (!stoppingToken.IsCancellationRequested)
                    {
                        message.Attempts++; message.LastError = ex is InvalidOperationException ? ex.Message : "Provider delivery failed";
                        message.NextAttemptAt = DateTime.UtcNow.AddMinutes(Math.Min(360, Math.Pow(2, message.Attempts)));
                        logger.LogWarning("Notification {Id} failed on attempt {Attempt}", message.Id, message.Attempts);
                    }
                }
                await db.SaveChangesAsync(stoppingToken); await tx.CommitAsync(stoppingToken);
            }
            catch (Exception) when (!stoppingToken.IsCancellationRequested) { logger.LogWarning("Notification worker could not process the outbox"); }
            await Task.Delay(TimeSpan.FromSeconds(15), stoppingToken);
        }
    }
}
