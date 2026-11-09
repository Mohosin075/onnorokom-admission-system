using Microsoft.EntityFrameworkCore;
using SchoolAdmission.Domain.Entities;
using SchoolAdmission.Domain.Repositories;

namespace SchoolAdmission.Infrastructure.Persistence.Repositories;

public class ClassRepository : IClassRepository
{
    private readonly ApplicationDbContext _context;

    public ClassRepository(ApplicationDbContext context)
    {
        _context = context;
    }

    public async Task<ClassRoom?> GetByIdAsync(string id, CancellationToken cancellationToken = default)
    {
        return await _context.Classes
            .AsNoTracking()
            .FirstOrDefaultAsync(c => c.Id == id, cancellationToken);
    }

    public async Task<ClassRoom?> GetByIdForUpdateAsync(string id, CancellationToken cancellationToken = default)
    {
        if (_context.Database.IsNpgsql())
        {
            // PostgreSQL Row-Level Lock: guarantees serialized access to the class during seat reservation
            var locked = await _context.Classes
                .FromSqlInterpolated($"SELECT * FROM classes WHERE id = {id} FOR UPDATE")
                .FirstOrDefaultAsync(cancellationToken);

            return locked;
        }

        // For in-memory testing environments
        return await _context.Classes
            .FirstOrDefaultAsync(c => c.Id == id, cancellationToken);
    }

    public async Task<List<ClassRoom>> GetAllAsync(CancellationToken cancellationToken = default)
    {
        return await _context.Classes
            .AsNoTracking()
            .OrderBy(c => c.CreatedAtUtc)
            .ToListAsync(cancellationToken);
    }

    public async Task AddAsync(ClassRoom classRoom, CancellationToken cancellationToken = default)
    {
        await _context.Classes.AddAsync(classRoom, cancellationToken);
    }
}

