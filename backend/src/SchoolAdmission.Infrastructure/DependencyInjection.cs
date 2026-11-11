using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using System.Data.Common;
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

        if (!string.IsNullOrWhiteSpace(connectionString))
        {
            var connection = new NpgsqlConnectionStringBuilder(connectionString);
            // Npgsql's ContainsKey also recognizes unset options with defaults.
            var supplied = new DbConnectionStringBuilder { ConnectionString = connectionString };
            var explicitPoolLimit = supplied.Keys.Cast<string>().Any(key =>
                key.Replace(" ", "").Equals("MaximumPoolSize", StringComparison.OrdinalIgnoreCase) ||
                key.Replace(" ", "").Equals("MaxPoolSize", StringComparison.OrdinalIgnoreCase));
            if (!explicitPoolLimit)
                connection.MaxPoolSize = Math.Max(connection.MinPoolSize, configuration.GetValue("Database:MaxPoolSize", 40));
            connectionString = connection.ConnectionString;
        }

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

