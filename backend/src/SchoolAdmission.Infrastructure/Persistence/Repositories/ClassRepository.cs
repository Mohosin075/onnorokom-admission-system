using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using Npgsql;
using SchoolAdmission.Domain.Entities;
using SchoolAdmission.Domain.Enums;
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
                .ToListAsync(cancellationToken);

            return locked.SingleOrDefault();
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

    public async Task<ClassAdmissionState?> GetAdmissionStateAsync(string id, string studentId, DateTime now, CancellationToken cancellationToken = default)
    {
        if (_context.Database.IsNpgsql())
        {
            // One parameterized, read-only round trip on the reservation hot path.
            // Reuse the current transaction when performing the authoritative locked check.
            await _context.Database.OpenConnectionAsync(cancellationToken);
            try
            {
                await using var command = _context.Database.GetDbConnection().CreateCommand();
                command.Transaction = _context.Database.CurrentTransaction?.GetDbTransaction();
                command.CommandText = """
                    SELECT c.total_seats,
                      (SELECT count(*)::int FROM seat_holds h WHERE h.class_id = c.id
                        AND (h.status = 'CONFIRMED' OR (h.status = 'HELD' AND h.expires_at_utc > @now))),
                      EXISTS(SELECT 1 FROM seat_holds h WHERE h.class_id = c.id AND h.student_id = @student
                        AND (h.status = 'CONFIRMED' OR (h.status = 'HELD' AND h.expires_at_utc > @now)))
                    FROM classes c WHERE c.id = @id
                    """;
                command.Parameters.Add(new NpgsqlParameter("id", id));
                command.Parameters.Add(new NpgsqlParameter("student", studentId));
                command.Parameters.Add(new NpgsqlParameter("now", now));
                await using var reader = await command.ExecuteReaderAsync(cancellationToken);
                return await reader.ReadAsync(cancellationToken)
                    ? new ClassAdmissionState(reader.GetInt32(0), reader.GetInt32(1), reader.GetBoolean(2)) : null;
            }
            finally { await _context.Database.CloseConnectionAsync(); }
        }

        return await _context.Classes.AsNoTracking().Where(c => c.Id == id)
            .Select(c => new ClassAdmissionState(c.TotalSeats,
                c.Holds.Count(h => h.Status == HoldStatus.CONFIRMED || (h.Status == HoldStatus.HELD && h.ExpiresAtUtc > now)),
                c.Holds.Any(h => h.StudentId == studentId &&
                    (h.Status == HoldStatus.CONFIRMED || (h.Status == HoldStatus.HELD && h.ExpiresAtUtc > now)))))
            .SingleOrDefaultAsync(cancellationToken);
    }

    public async Task AddAsync(ClassRoom classRoom, CancellationToken cancellationToken = default)
    {
        await _context.Classes.AddAsync(classRoom, cancellationToken);
    }
}

