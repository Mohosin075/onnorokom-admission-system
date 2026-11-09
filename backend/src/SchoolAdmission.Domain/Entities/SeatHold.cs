using SchoolAdmission.Domain.Enums;
using SchoolAdmission.Domain.Exceptions;

namespace SchoolAdmission.Domain.Entities;

public class SeatHold
{
    public string Id { get; private set; } = string.Empty;
    public string ClassId { get; private set; } = string.Empty;
    public string StudentId { get; private set; } = string.Empty;
    public HoldStatus Status { get; private set; }
    public DateTime CreatedAtUtc { get; private set; }
    public DateTime ExpiresAtUtc { get; private set; }
    public DateTime? ConfirmedAtUtc { get; private set; }
    public DateTime? CancelledAtUtc { get; private set; }

    public ClassRoom? ClassRoom { get; private set; }

    private SeatHold() { }

    public SeatHold(string id, string classId, string studentId, int durationSeconds)
    {
        if (string.IsNullOrWhiteSpace(id))
            throw new ValidationException("Hold id cannot be empty.");

        if (string.IsNullOrWhiteSpace(classId))
            throw new ValidationException("Class id cannot be empty.");

        if (string.IsNullOrWhiteSpace(studentId) || studentId.Trim().Length != 17 || !studentId.All(char.IsDigit))
            throw new ValidationException("Student id must be exactly a 17-digit birth registration number.");

        if (durationSeconds <= 0)
            durationSeconds = 600;

        Id = id;
        ClassId = classId;
        StudentId = studentId.Trim();
        Status = HoldStatus.HELD;
        CreatedAtUtc = DateTime.UtcNow;
        ExpiresAtUtc = CreatedAtUtc.AddSeconds(durationSeconds);
    }

    public bool IsActive(DateTime now)
    {
        return Status == HoldStatus.HELD && ExpiresAtUtc > now;
    }

    public void Confirm(string studentId, DateTime now)
    {
        if (string.IsNullOrWhiteSpace(studentId) || StudentId != studentId.Trim())
            throw new ValidationException("You can only confirm your own hold application.");

        // Idempotency rule: if already confirmed by same student, return safely
        if (Status == HoldStatus.CONFIRMED)
            return;

        if (Status == HoldStatus.CANCELLED)
            throw new ConflictException("Cannot confirm an application that has been cancelled.");

        if (Status == HoldStatus.EXPIRED || ExpiresAtUtc <= now)
        {
            Status = HoldStatus.EXPIRED;
            throw new ConflictException("Cannot confirm an application whose hold period has expired.");
        }

        if (Status != HoldStatus.HELD)
            throw new ConflictException($"Hold is not in a confirmable status (current: {Status}).");

        Status = HoldStatus.CONFIRMED;
        ConfirmedAtUtc = now;
    }

    public void Cancel(string studentId, DateTime now)
    {
        if (string.IsNullOrWhiteSpace(studentId) || StudentId != studentId.Trim())
            throw new ValidationException("You can only cancel your own hold application.");

        if (Status == HoldStatus.CONFIRMED)
            throw new ConflictException("Cannot cancel a confirmed admission.");

        Status = HoldStatus.CANCELLED;
        CancelledAtUtc = now;
    }

    public bool CheckAndExpire(DateTime now)
    {
        if (Status == HoldStatus.HELD && ExpiresAtUtc <= now)
        {
            Status = HoldStatus.EXPIRED;
            return true;
        }
        return false;
    }
}

