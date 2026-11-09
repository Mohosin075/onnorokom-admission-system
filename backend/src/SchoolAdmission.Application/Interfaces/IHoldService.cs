using SchoolAdmission.Application.DTOs;

namespace SchoolAdmission.Application.Interfaces;

public interface IHoldService
{
    Task<CreateHoldResponse> CreateHoldAsync(string classId, string studentId, CancellationToken cancellationToken = default);
    Task<HoldStatusResponse> GetHoldByIdAsync(string holdId, CancellationToken cancellationToken = default);
    Task<ConfirmHoldResponse> ConfirmHoldAsync(string holdId, string studentId, CancellationToken cancellationToken = default);
    Task CancelHoldAsync(string holdId, string studentId, CancellationToken cancellationToken = default);
    Task<List<StudentHoldResponse>> GetStudentHoldsAsync(string studentId, CancellationToken cancellationToken = default);
}
