using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using SchoolAdmission.Domain.Repositories;

namespace SchoolAdmission.Infrastructure.BackgroundServices;

public class HoldExpiryBackgroundService : BackgroundService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<HoldExpiryBackgroundService> _logger;
    private readonly TimeSpan _checkInterval = TimeSpan.FromSeconds(5);

    public HoldExpiryBackgroundService(
        IServiceProvider serviceProvider,
        ILogger<HoldExpiryBackgroundService> logger)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("HoldExpiryBackgroundService started. Monitoring expired holds every {Interval}s.", _checkInterval.TotalSeconds);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await ProcessExpiredHoldsAsync(stoppingToken);
            }
            catch (Exception ex) when (!stoppingToken.IsCancellationRequested)
            {
                _logger.LogError(ex, "Error occurred while processing expired holds.");
            }

            try
            {
                await Task.Delay(_checkInterval, stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }

        _logger.LogInformation("HoldExpiryBackgroundService stopped.");
    }

    private async Task ProcessExpiredHoldsAsync(CancellationToken cancellationToken)
    {
        using var scope = _serviceProvider.CreateScope();
        var holdRepository = scope.ServiceProvider.GetRequiredService<IHoldRepository>();
        var unitOfWork = scope.ServiceProvider.GetRequiredService<IUnitOfWork>();

        var now = DateTime.UtcNow;
        var expiredHolds = await holdRepository.GetPendingExpiredHoldsAsync(now, 100, cancellationToken);

        if (expiredHolds.Count > 0)
        {
            foreach (var hold in expiredHolds)
            {
                hold.CheckAndExpire(now);
            }

            await unitOfWork.SaveChangesAsync(cancellationToken);
            _logger.LogInformation("Cleaned up {Count} expired holds.", expiredHolds.Count);
        }
    }
}

