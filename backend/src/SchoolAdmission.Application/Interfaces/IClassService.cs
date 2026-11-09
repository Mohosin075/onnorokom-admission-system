using SchoolAdmission.Application.DTOs;

namespace SchoolAdmission.Application.Interfaces;

public interface IClassService
{
    Task<CreateClassResponse> CreateClassAsync(CreateClassRequest request, CancellationToken cancellationToken = default);
    Task<List<ClassResponse>> GetAllClassesAsync(CancellationToken cancellationToken = default);
    Task<ClassResponse> GetClassByIdAsync(string classId, CancellationToken cancellationToken = default);
}

