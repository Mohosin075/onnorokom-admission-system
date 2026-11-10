namespace SchoolAdmission.Domain.Entities;

public class PortalUser
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string Email { get; set; } = "";
    public string PasswordHash { get; set; } = "";
    public string Role { get; set; } = "Student";
    public string SecurityStamp { get; set; } = Guid.NewGuid().ToString("N");
    public bool EmailVerified { get; set; }
    public int FailedLogins { get; set; }
    public DateTime? LockedUntil { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public string? BirthRegistration { get; set; }
    public string FullName { get; set; } = "";
    public string GuardianName { get; set; } = "";
    public string Phone { get; set; } = "";
    public string Address { get; set; } = "";
    public DateTime? DateOfBirth { get; set; }
}

public class AccountToken
{
    public string Id { get; set; } = "";
    public string UserId { get; set; } = "";
    public string Purpose { get; set; } = "";
    public DateTime ExpiresAt { get; set; }
}

public class AdmissionDocument
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string UserId { get; set; } = "";
    public string Kind { get; set; } = "";
    public string OriginalName { get; set; } = "";
    public string ContentType { get; set; } = "";
    public string StorageKey { get; set; } = "";
    public string Sha256 { get; set; } = "";
    public long Size { get; set; }
    public string ReviewStatus { get; set; } = "Pending";
    public string? ReviewNote { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class AdmissionPayment
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string HoldId { get; set; } = "";
    public string UserId { get; set; } = "";
    public decimal Amount { get; set; }
    public string Currency { get; set; } = "BDT";
    public string Status { get; set; } = "Pending";
    public string? GatewayUrl { get; set; }
    public string? ValidationId { get; set; }
    public string? BankTransactionId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? PaidAt { get; set; }
}

public class NotificationMessage
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string UserId { get; set; } = "";
    public string Channel { get; set; } = "Email";
    public string Recipient { get; set; } = "";
    public string Subject { get; set; } = "";
    public string Body { get; set; } = "";
    public int Attempts { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime NextAttemptAt { get; set; } = DateTime.UtcNow;
    public DateTime? SentAt { get; set; }
    public string? LastError { get; set; }
}

public class PortalAudit
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string UserId { get; set; } = "";
    public string Action { get; set; } = "";
    public string ResourceId { get; set; } = "";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class AdmissionFee
{
    public string ClassId { get; set; } = "";
    public decimal Amount { get; set; }
}
