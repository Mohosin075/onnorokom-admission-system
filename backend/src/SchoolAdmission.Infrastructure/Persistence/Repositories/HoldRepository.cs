using Microsoft.EntityFrameworkCore;
using SchoolAdmission.Domain.Entities;
using SchoolAdmission.Domain.Enums;
using SchoolAdmission.Domain.Repositories;

namespace SchoolAdmission.Infrastructure.Persistence.Repositories;

public class HoldRepository : IHoldRepository
{
    private readonly ApplicationDbContext _context;

    public HoldRepository(ApplicationDbContext context)
    {
        _context = context;
    }

    public async Task<SeatHold?> GetByIdAsync(string id, CancellationToken cancellationToken = default)
    {
        return await _context.Holds
            .AsNoTracking()
            .FirstOrDefaultAsync(h => h.Id == id, cancellationToken);
    }

    public async Task<SeatHold?> GetByIdForUpdateAsync(string id, CancellationToken cancellationToken = default)
    {
        if (_context.Database.IsNpgsql())
        {
            var locked = await _context.Holds
                .FromSqlInterpolated($"SELECT * FROM seat_holds WHERE id = {id} FOR UPDATE")
                .ToListAsync(cancellationToken);
            return locked.SingleOrDefault();
        }

        return await _context.Holds.FirstOrDefaultAsync(h => h.Id == id, cancellationToken);
    }

    public async Task<int> ExpireHoldsAsync(DateTime now, CancellationToken cancellationToken = default)
    {
        var expired = _context.Holds.Where(h => h.Status == HoldStatus.HELD && h.ExpiresAtUtc <= now);
        if (_context.Database.IsRelational())
            return await expired.ExecuteUpdateAsync(
                setters => setters.SetProperty(h => h.Status, HoldStatus.EXPIRED), cancellationToken);

        var holds = await expired.ToListAsync(cancellationToken);
        foreach (var hold in holds) hold.CheckAndExpire(now);
        await _context.SaveChangesAsync(cancellationToken);
        return holds.Count;
    }

    public async Task<SeatHold?> GetByIdWithClassAsync(string id, CancellationToken cancellationToken = default)
    {
        return await _context.Holds
            .Include(h => h.ClassRoom)
            .FirstOrDefaultAsync(h => h.Id == id, cancellationToken);
    }

    public async Task<List<SeatHold>> GetByStudentIdAsync(string studentId, CancellationToken cancellationToken = default)
    {
        return await _context.Holds
            .AsNoTracking()
            .Include(h => h.ClassRoom)
            .Where(h => h.StudentId == studentId)
            .OrderByDescending(h => h.CreatedAtUtc)
            .ToListAsync(cancellationToken);
    }

    public async Task<bool> HasActiveHoldOrAdmissionAsync(string studentId, string classId, DateTime now, CancellationToken cancellationToken = default)
    {
        return await _context.Holds
            .AnyAsync(h => h.StudentId == studentId &&
                           h.ClassId == classId &&
                           (h.Status == HoldStatus.CONFIRMED || (h.Status == HoldStatus.HELD && h.ExpiresAtUtc > now)),
                      cancellationToken);
    }

    public async Task<int> GetActiveHoldCountAsync(string classId, DateTime now, CancellationToken cancellationToken = default)
    {
        return await _context.Holds
            .CountAsync(h => h.ClassId == classId &&
                             h.Status == HoldStatus.HELD &&
                             h.ExpiresAtUtc > now,
                        cancellationToken);
    }

    public async Task<int> GetConfirmedCountAsync(string classId, CancellationToken cancellationToken = default)
    {
        return await _context.Holds
            .CountAsync(h => h.ClassId == classId &&
                             h.Status == HoldStatus.CONFIRMED,
                        cancellationToken);
    }

    public async Task<Dictionary<string, (int Held, int Confirmed)>> GetSeatCountsForClassesAsync(DateTime now, CancellationToken cancellationToken = default)
    {
        var rawStats = await _context.Holds
            .Where(h => h.Status == HoldStatus.CONFIRMED || (h.Status == HoldStatus.HELD && h.ExpiresAtUtc > now))
            .GroupBy(h => new { h.ClassId, h.Status })
            .Select(g => new { g.Key.ClassId, g.Key.Status, Count = g.Count() })
            .ToListAsync(cancellationToken);

        var result = new Dictionary<string, (int Held, int Confirmed)>();
        foreach (var stat in rawStats)
        {
            if (!result.TryGetValue(stat.ClassId, out var current))
            {
                current = (0, 0);
            }

            if (stat.Status == HoldStatus.HELD)
            {
                result[stat.ClassId] = (current.Held + stat.Count, current.Confirmed);
            }
            else if (stat.Status == HoldStatus.CONFIRMED)
            {
                result[stat.ClassId] = (current.Held, current.Confirmed + stat.Count);
            }
        }

        return result;
    }

    public async Task<List<SeatHold>> GetPendingExpiredHoldsAsync(DateTime now, int limit = 100, CancellationToken cancellationToken = default)
    {
        return await _context.Holds
            .Where(h => h.Status == HoldStatus.HELD && h.ExpiresAtUtc <= now)
            .Take(limit)
            .ToListAsync(cancellationToken);
    }

    public async Task AddAsync(SeatHold hold, CancellationToken cancellationToken = default)
    {
        await _context.Holds.AddAsync(hold, cancellationToken);
    }

    public Task UpdateAsync(SeatHold hold, CancellationToken cancellationToken = default)
    {
        _context.Holds.Update(hold);
        return Task.CompletedTask;
    }
}

