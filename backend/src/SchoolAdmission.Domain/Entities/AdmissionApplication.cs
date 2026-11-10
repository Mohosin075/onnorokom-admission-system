namespace SchoolAdmission.Domain.Entities;

// Review is separate from a short-lived seat reservation. Pending review never consumes capacity.
public class AdmissionApplication
{
    public string Id { get; set; } = "a_" + Guid.NewGuid().ToString("N");
    public string UserId { get; set; } = "";
    public string ClassId { get; set; } = "";
    public string Status { get; set; } = "PendingReview";
    public int Version { get; set; } = 1;
    public string FullName { get; set; } = "";
    public string BirthRegistration { get; set; } = "";
    public DateTime DateOfBirth { get; set; }
    public string GuardianName { get; set; } = "";
    public string Phone { get; set; } = "";
    public string Address { get; set; } = "";
    public DateTime SubmittedAt { get; set; } = DateTime.UtcNow;
    public DateTime? ReviewedAt { get; set; }
    public string? ReviewedById { get; set; }
    public string? ReviewNote { get; set; }
    public List<ApplicationDocument> Documents { get; set; } = new();
}

public class ApplicationDocument
{
    public string ApplicationId { get; set; } = "";
    public string DocumentId { get; set; } = "";
    public string Kind { get; set; } = "";
}
