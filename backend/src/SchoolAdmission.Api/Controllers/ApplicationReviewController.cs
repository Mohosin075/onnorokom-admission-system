using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SchoolAdmission.Api.Portal;
using SchoolAdmission.Domain.Entities;
using SchoolAdmission.Infrastructure.Persistence;

namespace SchoolAdmission.Api.Controllers;

[ApiController, Authorize(Roles = "Admin"), Route("admin/applications")]
public class ApplicationReviewController(ApplicationDbContext db) : ControllerBase
{
    public record DecisionInput([Required, RegularExpression("^(Approved|ChangesRequested|Rejected)$")] string Status,
        [Range(1, int.MaxValue)] int Version, [MaxLength(1000)] string? Note, string[]? ReviewedDocumentIds);

    [HttpGet]
    public async Task<IActionResult> List([FromQuery] string? status, [FromQuery] string? search, [FromQuery] string? classId,
        [FromQuery] int page = 1, [FromQuery] int pageSize = 25, CancellationToken ct = default)
    {
        page = Math.Clamp(page, 1, 100000); pageSize = Math.Clamp(pageSize, 1, 100);
        var query = from a in db.Applications.AsNoTracking()
                    join u in db.Users on a.UserId equals u.Id
                    join c in db.Classes on a.ClassId equals c.Id
                    select new { a.Id, a.ClassId, ClassName = c.Name, a.FullName, u.Email, a.BirthRegistration, a.Status,
                        a.Version, a.SubmittedAt, a.ReviewedAt, a.ReviewNote };
        if (!string.IsNullOrWhiteSpace(status)) query = query.Where(x => x.Status == status);
        if (!string.IsNullOrWhiteSpace(classId)) query = query.Where(x => x.ClassId == classId);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var value = search.Trim().ToLowerInvariant();
            query = query.Where(x => x.FullName.ToLower().Contains(value) || x.Email.Contains(value) || x.BirthRegistration.Contains(value) || x.Id.Contains(value));
        }
        return Ok(new { total = await query.CountAsync(ct), page, pageSize,
            items = await query.OrderBy(x => x.SubmittedAt).ThenBy(x => x.Id).Skip((page - 1) * pageSize).Take(pageSize).ToListAsync(ct) });
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> Detail(string id, CancellationToken ct)
    {
        var application = await db.Applications.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id, ct);
        if (application == null) return NotFound();
        var user = await db.Users.AsNoTracking().SingleAsync(x => x.Id == application.UserId, ct);
        var cls = await db.Classes.AsNoTracking().SingleAsync(x => x.Id == application.ClassId, ct);
        var fee = await db.Fees.AsNoTracking().SingleOrDefaultAsync(x => x.ClassId == application.ClassId, ct);
        var documents = await (from link in db.ApplicationDocuments join d in db.Documents on link.DocumentId equals d.Id
            where link.ApplicationId == id select new { d.Id, d.Kind, d.OriginalName, d.Sha256, d.Size, d.CreatedAt }).ToListAsync(ct);
        var reviewer = application.ReviewedById == null ? null : await db.Users.Where(x => x.Id == application.ReviewedById).Select(x => x.Email).SingleOrDefaultAsync(ct);
        return Ok(new { application.Id, application.Status, application.Version, application.SubmittedAt, application.ReviewedAt,
            application.ReviewNote, reviewedBy = reviewer, application.ClassId, className = cls.Name, fee = fee?.Amount,
            applicant = new { application.FullName, application.BirthRegistration, dateOfBirth = application.DateOfBirth.ToString("yyyy-MM-dd"),
                application.GuardianName, application.Phone, application.Address, user.Email }, documents });
    }

    [HttpPut("{id}/review")]
    public async Task<IActionResult> Review(string id, DecisionInput input, CancellationToken ct)
    {
        if (input.Status != "Approved" && string.IsNullOrWhiteSpace(input.Note))
            return BadRequest(new { message = "Explain what the applicant needs to correct, or why the application is rejected." });
        var snapshot = await db.Applications.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id, ct);
        if (snapshot == null) return NotFound();
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        // Same order as submission/profile changes prevents approving a moving applicant record.
        var user = await db.Users.FromSqlInterpolated($"SELECT * FROM \"Users\" WHERE \"Id\"={snapshot.UserId} FOR UPDATE").SingleAsync(ct);
        var application = await db.Applications.FromSqlInterpolated($"SELECT * FROM \"Applications\" WHERE \"Id\"={id} FOR UPDATE").SingleAsync(ct);
        if (application.Version != input.Version || application.Status != "PendingReview")
            return Conflict(new { message = "This application changed or was already reviewed. Refresh it before making a decision." });
        var documents = await db.ApplicationDocuments.Where(x => x.ApplicationId == id).ToListAsync(ct);
        var required = documents.Where(x => x.Kind is "BirthCertificate" or "Photograph").Select(x => x.DocumentId).ToArray();
        if (input.Status == "Approved" && (required.Length != 2 || !required.All(x => input.ReviewedDocumentIds?.Contains(x) == true)))
            return BadRequest(new { message = "Inspect and acknowledge both the submitted birth certificate and photograph before approving this application." });
        application.Status = input.Status; application.ReviewNote = input.Note?.Trim();
        application.ReviewedAt = DateTime.UtcNow; application.ReviewedById = User.UserId();
        PortalSecurity.Audit(db, User.UserId(), "Application" + input.Status, id);
        var outcome = input.Status == "Approved"
            ? "Your application is approved. Sign in to reserve an available seat and then pay. Approval alone does not reserve a seat."
            : input.Status == "ChangesRequested" ? "Please correct your profile/documents and resubmit the application from My applications." : "Your application was rejected.";
        db.Notifications.Add(new NotificationMessage { UserId = user.Id, Recipient = user.Email, Subject = "Admission application reviewed",
            Body = $"Application {id}: {outcome} {application.ReviewNote}" });
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
        return Ok(new { application.Id, application.Status, application.ReviewNote });
    }
}
