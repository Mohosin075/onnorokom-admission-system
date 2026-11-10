using System.ComponentModel.DataAnnotations;
using System.Security.Cryptography;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SchoolAdmission.Api.Portal;
using SchoolAdmission.Domain.Entities;
using SchoolAdmission.Infrastructure.Persistence;
using ValidationException = SchoolAdmission.Domain.Exceptions.ValidationException;

namespace SchoolAdmission.Api.Controllers;

[ApiController, Authorize, Route("profile")]
public class ProfileController(ApplicationDbContext db, IConfiguration config) : ControllerBase
{
    public record ProfileInput(
        [Required, StringLength(150, MinimumLength = 2)] string FullName,
        [Required, RegularExpression(@"^[0-9]{17}$")] string BirthRegistration,
        [Required] DateOnly DateOfBirth,
        [Required, StringLength(150, MinimumLength = 2)] string GuardianName,
        [Required, RegularExpression(@"^(\+?88)?01[3-9][0-9]{8}$")] string Phone,
        [Required, StringLength(1000, MinimumLength = 10)] string Address);

    [HttpPut]
    public async Task<IActionResult> Save(ProfileInput input, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var userId = User.UserId();
        var user = await db.Users.FromSqlInterpolated($"SELECT * FROM \"Users\" WHERE \"Id\"={userId} FOR UPDATE").SingleAsync(ct);
        var dob = input.DateOfBirth.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);
        if (input.FullName.Trim().Length < 2 || input.GuardianName.Trim().Length < 2 || input.Address.Trim().Length < 10)
            throw new ValidationException("Applicant name, guardian name and address cannot be blank or whitespace.");
        if (dob >= DateTime.UtcNow.Date || dob < DateTime.UtcNow.AddYears(-100)) throw new ValidationException("Enter a valid date of birth.");
        if (user.BirthRegistration != null && (user.BirthRegistration != input.BirthRegistration || user.FullName != input.FullName.Trim() || user.DateOfBirth != dob)
            && (await db.Holds.AnyAsync(x => x.StudentId == user.BirthRegistration, ct) || await db.Documents.AnyAsync(x => x.UserId == user.Id, ct)))
            return Conflict(new { message = "Applicant name, birth registration and date of birth are locked after uploading documents or making an application. Contact admissions to correct them." });
        if (await db.Users.AnyAsync(x => x.BirthRegistration == input.BirthRegistration && x.Id != user.Id, ct))
            return Conflict(new { message = "This birth registration is already linked to another account. Contact admissions." });
        user.FullName = input.FullName.Trim(); user.BirthRegistration = input.BirthRegistration;
        user.DateOfBirth = dob; user.GuardianName = input.GuardianName.Trim(); user.Phone = input.Phone; user.Address = input.Address.Trim();
        PortalSecurity.Audit(db, user.Id, "ProfileUpdated", user.Id);
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateException) { return Conflict(new { message = "This birth registration is already linked to an account." }); }
        await tx.CommitAsync(ct);
        await HttpContext.SignInAsync("Cookies", PortalSecurity.Principal(user));
        return Ok(PortalSecurity.PublicUser(user));
    }

    [HttpGet("documents")]
    public async Task<IActionResult> Documents(CancellationToken ct) => Ok(await db.Documents.AsNoTracking()
        .Where(x => x.UserId == User.UserId()).Select(x => new { x.Id, x.Kind, x.OriginalName, x.Size, x.ReviewStatus, x.ReviewNote, x.CreatedAt }).ToListAsync(ct));

    [HttpPost("documents"), RequestSizeLimit(6_000_000)]
    public async Task<IActionResult> Upload([FromForm] IFormFile file, [FromForm] string kind, CancellationToken ct)
    {
        if (kind is not ("BirthCertificate" or "Photograph" or "AcademicRecord")) throw new ValidationException("Choose a supported document type.");
        if (file.Length is <= 0 or > 5_000_000) throw new ValidationException("Files must be between 1 byte and 5 MB.");
        await using var memory = new MemoryStream(); await file.CopyToAsync(memory, ct);
        var bytes = memory.ToArray();
        // Accept raster images only; PDFs and active content are deliberately excluded.
        var png = bytes.Length > 24 && bytes.AsSpan(0, 8).SequenceEqual(new byte[] {137,80,78,71,13,10,26,10});
        var jpeg = bytes.Length > 4 && bytes[0] == 255 && bytes[1] == 216 && bytes[2] == 255 && bytes[^2] == 255 && bytes[^1] == 217;
        if (!png && !jpeg) throw new ValidationException("Upload a PNG or JPEG image. PDFs and other files are not accepted.");
        var userId = User.UserId();
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var owner = await db.Users.FromSqlInterpolated($"SELECT * FROM \"Users\" WHERE \"Id\"={userId} FOR UPDATE").SingleAsync(ct);
        if (string.IsNullOrWhiteSpace(owner.BirthRegistration)) throw new ValidationException("Save your admission profile before uploading documents.");
        var document = await db.Documents.FromSqlInterpolated($"SELECT * FROM \"Documents\" WHERE \"UserId\"={userId} AND \"Kind\"={kind} FOR UPDATE").SingleOrDefaultAsync(ct);
        if (document?.ReviewStatus == "Approved") return Conflict(new { message = "An approved document cannot be replaced. Contact admissions." });
        var root = config["Portal:UploadPath"] ?? "/app/uploads"; Directory.CreateDirectory(root);
        var key = Guid.NewGuid().ToString("N"); var path = Path.Combine(root, key);
        await System.IO.File.WriteAllBytesAsync(path, bytes, ct);
        var oldKey = document?.StorageKey;
        document ??= new AdmissionDocument { UserId = userId, Kind = kind };
        if (db.Entry(document).State == EntityState.Detached) db.Documents.Add(document);
        document.StorageKey = key; document.OriginalName = Path.GetFileName(file.FileName)[..Math.Min(Path.GetFileName(file.FileName).Length, 200)];
        document.ContentType = png ? "image/png" : "image/jpeg"; document.Size = bytes.Length;
        document.Sha256 = Convert.ToHexString(SHA256.HashData(bytes)); document.ReviewStatus = "Pending"; document.ReviewNote = null;
        PortalSecurity.Audit(db, userId, "DocumentUploaded", document.Id);
        try { await db.SaveChangesAsync(ct); await tx.CommitAsync(ct); } catch { System.IO.File.Delete(path); throw; }
        if (oldKey != null) System.IO.File.Delete(Path.Combine(root, oldKey));
        return Ok(new { document.Id, document.ReviewStatus });
    }

    [HttpGet("documents/{id}/download")]
    public async Task<IActionResult> Download(string id, CancellationToken ct)
    {
        var document = await db.Documents.SingleOrDefaultAsync(x => x.Id == id && (x.UserId == User.UserId() || User.IsInRole("Admin")), ct);
        if (document == null) return NotFound();
        Response.Headers.CacheControl = "no-store";
        Response.Headers.ContentDisposition = $"attachment; filename=\"document-{document.Id}.{(document.ContentType == "image/png" ? "png" : "jpg")}\"";
        return PhysicalFile(Path.GetFullPath(Path.Combine(config["Portal:UploadPath"] ?? "/app/uploads", document.StorageKey)), "application/octet-stream");
    }
}
