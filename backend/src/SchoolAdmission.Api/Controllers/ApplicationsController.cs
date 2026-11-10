using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SchoolAdmission.Api.Portal;
using SchoolAdmission.Domain.Entities;
using SchoolAdmission.Infrastructure.Persistence;

namespace SchoolAdmission.Api.Controllers;

[ApiController, Authorize(Roles = "Student"), Route("applications")]
public class ApplicationsController(ApplicationDbContext db) : ControllerBase
{
    public record SubmitInput(string ClassId);

    [HttpGet("mine")]
    public async Task<IActionResult> Mine(CancellationToken ct)
    {
        var userId = User.UserId();
        return Ok(await (from a in db.Applications.AsNoTracking() join c in db.Classes on a.ClassId equals c.Id
            where a.UserId == userId orderby a.SubmittedAt descending
            select new { a.Id, a.ClassId, ClassName = c.Name, a.Status, a.Version, a.SubmittedAt, a.ReviewedAt, a.ReviewNote }).ToListAsync(ct));
    }

    [HttpPost]
    public async Task<IActionResult> Submit(SubmitInput input, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var userId = User.UserId();
        // Submissions and profile/upload changes use the same account lock.
        var user = await db.Users.FromSqlInterpolated($"SELECT * FROM \"Users\" WHERE \"Id\"={userId} FOR UPDATE").SingleAsync(ct);
        if (string.IsNullOrWhiteSpace(user.BirthRegistration) || string.IsNullOrWhiteSpace(user.FullName) || user.DateOfBirth == null
            || string.IsNullOrWhiteSpace(user.GuardianName) || string.IsNullOrWhiteSpace(user.Phone) || string.IsNullOrWhiteSpace(user.Address))
            return BadRequest(new { message = "Complete your applicant and guardian profile before submitting an application." });
        if (!await db.Fees.AnyAsync(x => x.ClassId == input.ClassId && x.Amount >= 10, ct))
            return BadRequest(new { message = "Admissions are not open for this class." });

        var documents = await db.Documents.Where(x => x.UserId == userId).OrderByDescending(x => x.CreatedAt).ThenByDescending(x => x.Id).ToListAsync(ct);
        var latest = documents.GroupBy(x => x.Kind).Select(x => x.First()).ToList();
        if (!latest.Any(x => x.Kind == "BirthCertificate") || !latest.Any(x => x.Kind == "Photograph"))
            return BadRequest(new { message = "Upload your birth certificate and photograph. They do not need to be approved before you apply." });

        var application = await db.Applications.Include(x => x.Documents).SingleOrDefaultAsync(x => x.UserId == userId && x.ClassId == input.ClassId, ct);
        if (application != null && application.Status != "ChangesRequested")
            return Conflict(new { message = "An application already exists for this class. Follow its current status in My applications." });
        var resubmission = application != null;
        if (application == null) { application = new AdmissionApplication { UserId = userId, ClassId = input.ClassId }; db.Applications.Add(application); }
        else
        {
            db.ApplicationDocuments.RemoveRange(application.Documents);
            await db.SaveChangesAsync(ct);
            application.Documents.Clear();
            application.Version++;
        }
        application.FullName = user.FullName; application.BirthRegistration = user.BirthRegistration;
        application.DateOfBirth = user.DateOfBirth.Value; application.GuardianName = user.GuardianName;
        application.Phone = user.Phone; application.Address = user.Address;
        application.Status = "PendingReview"; application.SubmittedAt = DateTime.UtcNow;
        application.ReviewedAt = null; application.ReviewedById = null;
        foreach (var doc in latest) application.Documents.Add(new ApplicationDocument { ApplicationId = application.Id, DocumentId = doc.Id, Kind = doc.Kind });
        PortalSecurity.Audit(db, userId, resubmission ? "ApplicationResubmitted" : "ApplicationSubmitted", application.Id);
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
        return StatusCode(resubmission ? 200 : 201, new { application.Id, application.Status, application.Version });
    }
}
