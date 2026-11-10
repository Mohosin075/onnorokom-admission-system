using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using SchoolAdmission.Domain.Entities;
using SchoolAdmission.Domain.Exceptions;
using SchoolAdmission.Infrastructure.Persistence;

namespace SchoolAdmission.Api.Portal;

public static class PortalSecurity
{
    public static string UserId(this ClaimsPrincipal user) => user.FindFirstValue(ClaimTypes.NameIdentifier)
        ?? throw new UnauthorizedAccessException("Sign in to continue.");
    public static string StudentId(this ClaimsPrincipal user) => user.FindFirstValue("birthRegistration")
        ?? throw new ValidationException("Complete your admission profile first.");
    public static string TokenHash(string token) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));
    public static void Password(string password)
    {
        if (password.Length < 6 || password.Length > 8 || !password.Any(char.IsLetter) || !password.Any(char.IsDigit))
            throw new ValidationException("Use a password of 6–8 characters with letters and numbers.");
    }
    public static ClaimsPrincipal Principal(PortalUser user) => new(new ClaimsIdentity(new[] {
        new Claim(ClaimTypes.NameIdentifier, user.Id), new Claim(ClaimTypes.Email, user.Email),
        new Claim(ClaimTypes.Role, user.Role), new Claim("stamp", user.SecurityStamp),
        new Claim("birthRegistration", user.BirthRegistration ?? "")
    }, "Cookies"));
    public static object PublicUser(PortalUser user) => new { user.Id, user.Email, user.Role, user.EmailVerified,
        user.BirthRegistration, user.FullName, user.GuardianName, user.Phone, user.Address,
        dateOfBirth = user.DateOfBirth?.ToString("yyyy-MM-dd") };

    public static async Task<PortalUser> Current(ApplicationDbContext db, ClaimsPrincipal principal, CancellationToken ct) =>
        await db.Users.SingleOrDefaultAsync(x => x.Id == principal.UserId(), ct)
        ?? throw new UnauthorizedAccessException("Account unavailable.");

    public static void Audit(ApplicationDbContext db, string userId, string action, string resource) =>
        db.Audit.Add(new PortalAudit { UserId = userId, Action = action, ResourceId = resource });

    public static async Task QueueToken(ApplicationDbContext db, IConfiguration config, PortalUser user, string purpose, CancellationToken ct)
    {
        var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
        db.AccountTokens.Add(new AccountToken { Id = TokenHash(token), UserId = user.Id, Purpose = purpose,
            ExpiresAt = DateTime.UtcNow.AddHours(purpose == "verify" ? 24 : 1) });
        var link = $"{config["Portal:PublicUrl"]!.TrimEnd('/')}/?action={purpose}&token={token}";
        db.Notifications.Add(new NotificationMessage { UserId = user.Id, Recipient = user.Email,
            Subject = purpose == "verify" ? "Verify your admission account" : "Reset your admission account password",
            Body = $"Open this link to {purpose} your account: {link}\nIf you did not request this, ignore this email." });
        await db.SaveChangesAsync(ct);
    }
}
