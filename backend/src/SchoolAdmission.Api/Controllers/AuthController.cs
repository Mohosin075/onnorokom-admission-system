using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using SchoolAdmission.Api.Portal;
using SchoolAdmission.Domain.Entities;
using SchoolAdmission.Infrastructure.Persistence;
using ValidationException = SchoolAdmission.Domain.Exceptions.ValidationException;

namespace SchoolAdmission.Api.Controllers;

[ApiController, Route("auth"), EnableRateLimiting("auth")]
public class AuthController(ApplicationDbContext db, IConfiguration config, IPasswordHasher<PortalUser> hasher, IWebHostEnvironment environment) : ControllerBase
{
    public record Credentials([Required, EmailAddress, MaxLength(254)] string Email, [Required, MaxLength(128)] string Password);
    public record RegistrationInput([Required, EmailAddress, MaxLength(254)] string Email, [Required, StringLength(8, MinimumLength = 6)] string Password);
    public record TokenInput([Required, MaxLength(128)] string Token);
    public record ResetInput([Required, MaxLength(128)] string Token, [Required, StringLength(8, MinimumLength = 6)] string Password);
    public record EmailInput([Required, EmailAddress, MaxLength(254)] string Email);

    [HttpPost("register")]
    public async Task<IActionResult> Register(RegistrationInput input, CancellationToken ct)
    {
        PortalSecurity.Password(input.Password);
        if (string.IsNullOrWhiteSpace(config["Smtp:Host"]))
            return StatusCode(503, new { message = "Account registration is unavailable until the institution configures email delivery." });
        var email = input.Email.Trim().ToLowerInvariant();
        if (!await db.Users.AnyAsync(x => x.Email == email, ct))
        {
            var user = new PortalUser { Email = email };
            user.PasswordHash = hasher.HashPassword(user, input.Password);
            db.Users.Add(user);
            try { await PortalSecurity.QueueToken(db, config, user, "verify", ct); }
            catch (DbUpdateException) { return Conflict(new { message = "Unable to register this account. Try signing in or recovering access." }); }
        }
        return Ok(new { message = "If registration is available for this email, a verification link will be sent. Check your inbox." });
    }

    [HttpPost("login")]
    public async Task<IActionResult> Login(Credentials input, CancellationToken ct)
    {
        var user = await db.Users.SingleOrDefaultAsync(x => x.Email == input.Email.Trim().ToLowerInvariant(), ct);
        if (user == null)
        {
            // Perform password work for unknown accounts too.
            hasher.HashPassword(new PortalUser(), input.Password);
            return Unauthorized(new { message = "Email or password is incorrect." });
        }
        if (!environment.IsDevelopment() && !environment.IsEnvironment("Testing") && user.Email.EndsWith(".invalid", StringComparison.OrdinalIgnoreCase))
            return Unauthorized(new { message = "Development accounts cannot be used in production." });
        if (user.LockedUntil > DateTime.UtcNow) return StatusCode(429, new { message = "Too many attempts. Try again in 15 minutes." });
        var valid = hasher.VerifyHashedPassword(user, user.PasswordHash, input.Password);
        if (valid == PasswordVerificationResult.Failed)
        {
            user.FailedLogins++;
            if (user.FailedLogins >= 5) { user.LockedUntil = DateTime.UtcNow.AddMinutes(15); user.FailedLogins = 0; }
            await db.SaveChangesAsync(ct);
            return Unauthorized(new { message = "Email or password is incorrect." });
        }
        if (!user.EmailVerified) return StatusCode(403, new { message = "Verify your email before signing in. You can request another verification email." });
        user.FailedLogins = 0; user.LockedUntil = null;
        if (valid == PasswordVerificationResult.SuccessRehashNeeded) user.PasswordHash = hasher.HashPassword(user, input.Password);
        PortalSecurity.Audit(db, user.Id, "SignedIn", user.Id);
        await db.SaveChangesAsync(ct);
        await HttpContext.SignInAsync("Cookies", PortalSecurity.Principal(user), new AuthenticationProperties { IsPersistent = false });
        return Ok(PortalSecurity.PublicUser(user));
    }

    [Authorize, HttpGet("me")]
    public async Task<IActionResult> Me(CancellationToken ct) => Ok(PortalSecurity.PublicUser(await PortalSecurity.Current(db, User, ct)));

    [Authorize, HttpPost("logout")]
    public async Task<IActionResult> Logout(CancellationToken ct) {
        var user = await PortalSecurity.Current(db, User, ct);
        user.SecurityStamp = Guid.NewGuid().ToString("N");
        await db.SaveChangesAsync(ct);
        await HttpContext.SignOutAsync(); return NoContent();
    }

    [HttpPost("verify")]
    public async Task<IActionResult> Verify(TokenInput input, CancellationToken ct)
    {
        var token = await ValidToken(input.Token, "verify", ct);
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        if (await db.AccountTokens.Where(x => x.Id == token.Id).ExecuteDeleteAsync(ct) != 1)
            throw new ValidationException("This verification link has already been used.");
        var user = await db.Users.SingleAsync(x => x.Id == token.UserId, ct);
        user.EmailVerified = true;
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
        return Ok(new { message = "Email verified. You can now sign in." });
    }

    [HttpPost("resend-verification"), HttpPost("forgot-password")]
    public async Task<IActionResult> SendToken(EmailInput input, CancellationToken ct)
    {
        var purpose = Request.Path.Value!.EndsWith("forgot-password") ? "reset" : "verify";
        var user = await db.Users.SingleOrDefaultAsync(x => x.Email == input.Email.Trim().ToLowerInvariant(), ct);
        if (user != null && (purpose == "reset" || !user.EmailVerified)
            && !await db.AccountTokens.AnyAsync(x => x.UserId == user.Id && x.Purpose == purpose && x.ExpiresAt > DateTime.UtcNow.AddMinutes(purpose == "verify" ? 1438 : 58), ct))
            await PortalSecurity.QueueToken(db, config, user, purpose, ct);
        return Ok(new { message = "If the account is eligible, an email will be sent." });
    }

    [HttpPost("reset-password")]
    public async Task<IActionResult> Reset(ResetInput input, CancellationToken ct)
    {
        PortalSecurity.Password(input.Password);
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var token = await ValidToken(input.Token, "reset", ct);
        if (await db.AccountTokens.Where(x => x.Id == token.Id).ExecuteDeleteAsync(ct) != 1)
            throw new ValidationException("This reset link has already been used.");
        var user = await db.Users.SingleAsync(x => x.Id == token.UserId, ct);
        user.PasswordHash = hasher.HashPassword(user, input.Password);
        user.SecurityStamp = Guid.NewGuid().ToString("N"); user.LockedUntil = null; user.FailedLogins = 0;
        db.AccountTokens.RemoveRange(await db.AccountTokens.Where(x => x.UserId == user.Id && x.Purpose == "reset").ToListAsync(ct));
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
        return Ok(new { message = "Password changed. Sign in with your new password." });
    }

    private async Task<AccountToken> ValidToken(string value, string purpose, CancellationToken ct) =>
        await db.AccountTokens.SingleOrDefaultAsync(x => x.Id == PortalSecurity.TokenHash(value) && x.Purpose == purpose && x.ExpiresAt > DateTime.UtcNow, ct)
        ?? throw new ValidationException("This link is invalid or expired. Request a new email.");
}
