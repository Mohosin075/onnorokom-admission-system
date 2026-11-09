using Microsoft.Extensions.Options;
using SchoolAdmission.Application.Common;
using SchoolAdmission.Application.DTOs;
using SchoolAdmission.Application.Interfaces;
using SchoolAdmission.Domain.Entities;
using SchoolAdmission.Domain.Enums;
using SchoolAdmission.Domain.Exceptions;
using SchoolAdmission.Domain.Repositories;

namespace SchoolAdmission.Application.Services;

public class HoldService : IHoldService
{
    private readonly IClassRepository _classRepository;
    private readonly IHoldRepository _holdRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly HoldOptions _options;

    public HoldService(
        IClassRepository classRepository,
        IHoldRepository holdRepository,
        IUnitOfWork unitOfWork,
        IOptions<HoldOptions> options)
    {
        _classRepository = classRepository;
        _holdRepository = holdRepository;
        _unitOfWork = unitOfWork;
        _options = options.Value;
    }

    public async Task<CreateHoldResponse> CreateHoldAsync(string classId, string studentId, CancellationToken cancellationToken = default)
    {
        ValidateStudentId(studentId);
        studentId = studentId.Trim();

        await using var tx = await _unitOfWork.BeginTransactionAsync(cancellationToken);

        // Lock class row to ensure strictly serialized seat allocation
        var cls = await _classRepository.GetByIdForUpdateAsync(classId, cancellationToken);
        if (cls == null)
            throw new EntityNotFoundException("Class", classId);

        var now = DateTime.UtcNow;

        // Rule 3: Single active application limit
        var hasActive = await _holdRepository.HasActiveHoldOrAdmissionAsync(studentId, classId, now, cancellationToken);
        if (hasActive)
            throw new ConflictException("Student already has an active hold or confirmed admission in this class.");

        // Rule 1: No Overselling
        var heldSeats = await _holdRepository.GetActiveHoldCountAsync(classId, now, cancellationToken);
        var confirmedSeats = await _holdRepository.GetConfirmedCountAsync(classId, cancellationToken);

        if (heldSeats + confirmedSeats >= cls.TotalSeats)
            throw new ConflictException("No available seats left in this class.");

        var holdId = $"h_{Guid.NewGuid():N}";
        var hold = new SeatHold(holdId, classId, studentId, _options.HoldDurationSeconds);

        await _holdRepository.AddAsync(hold, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
        await _unitOfWork.CommitTransactionAsync(cancellationToken);

        return new CreateHoldResponse(
            hold.Id,
            hold.ClassId,
            hold.StudentId,
            hold.Status.ToString(),
            hold.ExpiresAtUtc
        );
    }

    public async Task<HoldStatusResponse> GetHoldByIdAsync(string holdId, CancellationToken cancellationToken = default)
    {
        var hold = await _holdRepository.GetByIdAsync(holdId, cancellationToken);
        if (hold == null)
            throw new EntityNotFoundException("Hold", holdId);

        var now = DateTime.UtcNow;

        return new HoldStatusResponse(
            hold.Id,
            hold.ClassId,
            EffectiveStatus(hold, now),
            hold.ExpiresAtUtc
        );
    }

    public async Task<ConfirmHoldResponse> ConfirmHoldAsync(string holdId, string studentId, CancellationToken cancellationToken = default)
    {
        ValidateStudentId(studentId);

        await using var tx = await _unitOfWork.BeginTransactionAsync(cancellationToken);

        var hold = await LockHoldAsync(holdId, cancellationToken);

        var now = DateTime.UtcNow;
        hold.Confirm(studentId, now);

        await _unitOfWork.SaveChangesAsync(cancellationToken);
        await _unitOfWork.CommitTransactionAsync(cancellationToken);

        return new ConfirmHoldResponse(hold.Id, hold.Status.ToString());
    }

    public async Task CancelHoldAsync(string holdId, string studentId, CancellationToken cancellationToken = default)
    {
        ValidateStudentId(studentId);

        await using var tx = await _unitOfWork.BeginTransactionAsync(cancellationToken);

        var hold = await LockHoldAsync(holdId, cancellationToken);

        var now = DateTime.UtcNow;
        hold.Cancel(studentId, now);

        await _unitOfWork.SaveChangesAsync(cancellationToken);
        await _unitOfWork.CommitTransactionAsync(cancellationToken);
    }

    public async Task<List<StudentHoldResponse>> GetStudentHoldsAsync(string studentId, CancellationToken cancellationToken = default)
    {
        ValidateStudentId(studentId);
        studentId = studentId.Trim();

        var holds = await _holdRepository.GetByStudentIdAsync(studentId, cancellationToken);
        var now = DateTime.UtcNow;

        var result = new List<StudentHoldResponse>(holds.Count);
        foreach (var hold in holds)
        {

            result.Add(new StudentHoldResponse(
                hold.Id,
                hold.ClassId,
                hold.ClassRoom?.Name ?? hold.ClassId,
                EffectiveStatus(hold, now),
                hold.ExpiresAtUtc
            ));
        }

        return result;
    }

    // Capacity-changing operations lock class first, then hold, before checking time.
    private async Task<SeatHold> LockHoldAsync(string holdId, CancellationToken cancellationToken)
    {
        var snapshot = await _holdRepository.GetByIdAsync(holdId, cancellationToken)
            ?? throw new EntityNotFoundException("Hold", holdId);
        await _classRepository.GetByIdForUpdateAsync(snapshot.ClassId, cancellationToken);
        return await _holdRepository.GetByIdForUpdateAsync(holdId, cancellationToken)
            ?? throw new EntityNotFoundException("Hold", holdId);
    }

    private static string EffectiveStatus(SeatHold hold, DateTime now) =>
        hold.Status == HoldStatus.HELD && hold.ExpiresAtUtc <= now
            ? nameof(HoldStatus.EXPIRED) : hold.Status.ToString();

    private static void ValidateStudentId(string studentId)
    {
        if (string.IsNullOrWhiteSpace(studentId) || studentId.Trim().Length != 17 || !studentId.Trim().All(c => c >= '0' && c <= '9'))
            throw new ValidationException("Student id must be exactly a 17-digit birth registration number.");
    }
}

