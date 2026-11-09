using SchoolAdmission.Domain.Entities;

namespace SchoolAdmission.Domain.Repositories;

public interface IClassRepository
{
    Task<ClassRoom?> GetByIdAsync(string id, CancellationToken cancellationToken = default);
    Task<ClassRoom?> GetByIdForUpdateAsync(string id, CancellationToken cancellationToken = default);
    Task<List<ClassRoom>> GetAllAsync(CancellationToken cancellationToken = default);
    Task AddAsync(ClassRoom classRoom, CancellationToken cancellationToken = default);
}

