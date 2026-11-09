using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using SchoolAdmission.Domain.Repositories;
using SchoolAdmission.Infrastructure.BackgroundServices;
using SchoolAdmission.Infrastructure.Persistence;
using SchoolAdmission.Infrastructure.Persistence.Repositories;

namespace SchoolAdmission.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        var connectionString = configuration.GetConnectionString("DefaultConnection")
            ?? configuration["DATABASE_URL"]
            ?? configuration["DB_CONNECTION_STRING"];

        services.AddDbContext<ApplicationDbContext>(options =>
        {
            if (!string.IsNullOrWhiteSpace(connectionString))
            {
                options.UseNpgsql(connectionString, npgsqlOptions =>
                {
                    npgsqlOptions.MigrationsAssembly(typeof(ApplicationDbContext).Assembly.FullName);
                });
            }
            else
            {
                throw new InvalidOperationException("Set ConnectionStrings__DefaultConnection to a PostgreSQL connection string.");
            }
        });

        services.AddScoped<IClassRepository, ClassRepository>();
        services.AddScoped<IHoldRepository, HoldRepository>();
        services.AddScoped<IUnitOfWork, UnitOfWork>();

        services.AddHostedService<HoldExpiryBackgroundService>();

        return services;
    }
}

