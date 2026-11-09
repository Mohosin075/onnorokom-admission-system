using SchoolAdmission.Domain.Entities;

namespace SchoolAdmission.Domain.Repositories;

public interface IHoldRepository
{
    Task<SeatHold?> GetByIdAsync(string id, CancellationToken cancellationToken = default);
    Task<SeatHold?> GetByIdForUpdateAsync(string id, CancellationToken cancellationToken = default);
    Task<int> ExpireHoldsAsync(DateTime now, CancellationToken cancellationToken = default);
    Task<SeatHold?> GetByIdWithClassAsync(string id, CancellationToken cancellationToken = default);
    Task<List<SeatHold>> GetByStudentIdAsync(string studentId, CancellationToken cancellationToken = default);
    Task<bool> HasActiveHoldOrAdmissionAsync(string studentId, string classId, DateTime now, CancellationToken cancellationToken = default);
    Task<int> GetActiveHoldCountAsync(string classId, DateTime now, CancellationToken cancellationToken = default);
    Task<int> GetConfirmedCountAsync(string classId, CancellationToken cancellationToken = default);
    Task<Dictionary<string, (int Held, int Confirmed)>> GetSeatCountsForClassesAsync(DateTime now, CancellationToken cancellationToken = default);
    Task<List<SeatHold>> GetPendingExpiredHoldsAsync(DateTime now, int limit = 100, CancellationToken cancellationToken = default);
    Task AddAsync(SeatHold hold, CancellationToken cancellationToken = default);
    Task UpdateAsync(SeatHold hold, CancellationToken cancellationToken = default);
}

