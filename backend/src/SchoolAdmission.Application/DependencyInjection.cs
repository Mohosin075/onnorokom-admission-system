using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using SchoolAdmission.Application.Common;
using SchoolAdmission.Application.Interfaces;
using SchoolAdmission.Application.Services;

namespace SchoolAdmission.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddApplication(this IServiceCollection services, IConfiguration configuration)
    {
        services.Configure<HoldOptions>(options =>
        {
            var envSec = Environment.GetEnvironmentVariable("HOLD_DURATION_SECONDS");
            if (!string.IsNullOrWhiteSpace(envSec) && int.TryParse(envSec, out var duration))
            {
                options.HoldDurationSeconds = duration;
            }
            else
            {
                var configVal = configuration.GetValue<int?>("HoldSettings:HoldDurationSeconds");
                options.HoldDurationSeconds = configVal ?? 600;
            }
        });

        services.AddScoped<IClassService, ClassService>();
        services.AddScoped<IHoldService, HoldService>();

        return services;
    }
}
