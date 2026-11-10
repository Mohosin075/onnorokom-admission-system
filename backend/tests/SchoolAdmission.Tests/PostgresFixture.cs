using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Hosting;
using Npgsql;
using SchoolAdmission.Application.Common;
using SchoolAdmission.Infrastructure.Persistence;

namespace SchoolAdmission.Tests;

public sealed class PostgresFactAttribute : FactAttribute
{
    public PostgresFactAttribute()
    {
        if (string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("TEST_POSTGRES_CONNECTION")))
            Skip = "Set TEST_POSTGRES_CONNECTION to run real PostgreSQL integration tests.";
    }
}

// Every test class gets a disposable database; application and developer data are untouched.
public sealed class PostgresFixture : IAsyncLifetime
{
    private readonly string _database = $"school_admission_tests_{Guid.NewGuid():N}";
    private string? _adminConnection;
    public string ConnectionString { get; private set; } = "";

    public async Task InitializeAsync()
    {
        var configured = Environment.GetEnvironmentVariable("TEST_POSTGRES_CONNECTION");
        if (string.IsNullOrWhiteSpace(configured)) return;
        var builder = new NpgsqlConnectionStringBuilder(configured) { Database = "postgres" };
        _adminConnection = builder.ConnectionString;
        await using var connection = new NpgsqlConnection(_adminConnection);
        await connection.OpenAsync();
        await using var command = new NpgsqlCommand($"CREATE DATABASE \"{_database}\"", connection);
        await command.ExecuteNonQueryAsync();
        builder.Database = _database;
        ConnectionString = builder.ConnectionString;
    }

    public AdmissionFactory CreateFactory(int duration = 600) => new(ConnectionString, duration);
    public AdmissionFactory CreateAssessmentFactory(int duration = 600) => new(ConnectionString, duration, "Assessment");

    public async Task DisposeAsync()
    {
        if (_adminConnection == null || ConnectionString.Length == 0) return;
        await using var connection = new NpgsqlConnection(_adminConnection);
        await connection.OpenAsync();
        await using var command = new NpgsqlCommand($"DROP DATABASE \"{_database}\" WITH (FORCE)", connection);
        await command.ExecuteNonQueryAsync();
    }
}

public sealed class AdmissionFactory(string connectionString, int duration, string mode = "Portal") : WebApplicationFactory<Program>
{
    protected override IHost CreateHost(IHostBuilder builder)
    {
        // Mode selects startup services, so it must be available before Program creates its service collection.
        builder.ConfigureHostConfiguration(configuration => configuration.AddInMemoryCollection(
            new Dictionary<string, string?> { ["ApplicationMode"] = mode }));
        return base.CreateHost(builder);
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.ConfigureLogging(logging => logging.ClearProviders().AddConsole());
        builder.ConfigureAppConfiguration((_, configuration) => configuration.AddInMemoryCollection(
            new Dictionary<string, string?> { ["ConnectionStrings:DefaultConnection"] = connectionString, ["ApplicationMode"] = mode }));
        builder.ConfigureServices(services =>
        {
            services.RemoveAll<DbContextOptions<ApplicationDbContext>>();
            services.AddDbContext<ApplicationDbContext>(options => options.UseNpgsql(connectionString));
            services.PostConfigure<HoldOptions>(options => options.HoldDurationSeconds = duration);
        });
    }
}
