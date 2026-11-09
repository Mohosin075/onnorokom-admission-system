using Microsoft.EntityFrameworkCore.Storage;
using SchoolAdmission.Domain.Repositories;

namespace SchoolAdmission.Infrastructure.Persistence.Repositories;

public class UnitOfWork : IUnitOfWork
{
    private readonly ApplicationDbContext _context;
    private IDbContextTransaction? _currentTransaction;

    public UnitOfWork(ApplicationDbContext context)
    {
        _context = context;
    }

    public async Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        return await _context.SaveChangesAsync(cancellationToken);
    }

    public async Task<IAsyncDisposable> BeginTransactionAsync(CancellationToken cancellationToken = default)
    {
        if (_currentTransaction != null)
        {
            throw new InvalidOperationException("A transaction is already active in this unit of work.");
        }

        // EF Core InMemory provider does not support physical transactions
        if (_context.Database.ProviderName == "Microsoft.EntityFrameworkCore.InMemory")
        {
            return new NullAsyncDisposable();
        }

        _currentTransaction = await _context.Database.BeginTransactionAsync(cancellationToken);
        return new TransactionScope(this);
    }

    public async Task CommitTransactionAsync(CancellationToken cancellationToken = default)
    {
        if (_currentTransaction == null)
            return;

        await _currentTransaction.CommitAsync(cancellationToken);
    }

    public async Task RollbackTransactionAsync(CancellationToken cancellationToken = default)
    {
        if (_currentTransaction == null)
            return;

        try
        {
            await _currentTransaction.RollbackAsync(cancellationToken);
        }
        finally
        {
            await _currentTransaction.DisposeAsync();
            _currentTransaction = null;
        }
    }

    private sealed class NullAsyncDisposable : IAsyncDisposable
    {
        public ValueTask DisposeAsync() => ValueTask.CompletedTask;
    }

    private sealed class TransactionScope(UnitOfWork owner) : IAsyncDisposable
    {
        public async ValueTask DisposeAsync()
        {
            if (owner._currentTransaction is not { } transaction) return;
            owner._currentTransaction = null;
            // Disposing an uncommitted transaction rolls it back, including error paths.
            await transaction.DisposeAsync();
        }
    }
}
