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

        var holdId = $"h_{Guid.NewGuid().ToString("N")[..8]}";
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
        if (hold.CheckAndExpire(now))
        {
            await _unitOfWork.SaveChangesAsync(cancellationToken);
        }

        return new HoldStatusResponse(
            hold.Id,
            hold.ClassId,
            hold.Status.ToString(),
            hold.ExpiresAtUtc
        );
    }

    public async Task<ConfirmHoldResponse> ConfirmHoldAsync(string holdId, string studentId, CancellationToken cancellationToken = default)
    {
        ValidateStudentId(studentId);

        await using var tx = await _unitOfWork.BeginTransactionAsync(cancellationToken);

        var hold = await _holdRepository.GetByIdAsync(holdId, cancellationToken);
        if (hold == null)
            throw new EntityNotFoundException("Hold", holdId);

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

        var hold = await _holdRepository.GetByIdAsync(holdId, cancellationToken);
        if (hold == null)
            throw new EntityNotFoundException("Hold", holdId);

        var now = DateTime.UtcNow;
        hold.Cancel(studentId, now);

        await _unitOfWork.SaveChangesAsync(cancellationToken);
        await _unitOfWork.CommitTransactionAsync(cancellationToken);
    }

    public async Task<List<StudentHoldResponse>> GetStudentHoldsAsync(string studentId, CancellationToken cancellationToken = default)
    {
        ValidateStudentId(studentId);

        var holds = await _holdRepository.GetByStudentIdAsync(studentId, cancellationToken);
        var now = DateTime.UtcNow;
        var hasChanges = false;

        var result = new List<StudentHoldResponse>(holds.Count);
        foreach (var hold in holds)
        {
            if (hold.CheckAndExpire(now))
            {
                hasChanges = true;
            }

            result.Add(new StudentHoldResponse(
                hold.Id,
                hold.ClassId,
                hold.ClassRoom?.Name ?? hold.ClassId,
                hold.Status.ToString(),
                hold.ExpiresAtUtc
            ));
        }

        if (hasChanges)
        {
            await _unitOfWork.SaveChangesAsync(cancellationToken);
        }

        return result;
    }

    private static void ValidateStudentId(string studentId)
    {
        if (string.IsNullOrWhiteSpace(studentId) || studentId.Trim().Length != 17 || !studentId.Trim().All(char.IsDigit))
            throw new ValidationException("Student id must be exactly a 17-digit birth registration number.");
    }
}
