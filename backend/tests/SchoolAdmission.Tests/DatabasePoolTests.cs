using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using SchoolAdmission.Infrastructure;
using SchoolAdmission.Infrastructure.Persistence;

namespace SchoolAdmission.Tests;

public class DatabasePoolTests
{
    [Theory]
    [InlineData("", 40)]
    [InlineData(";Maximum Pool Size=12", 12)]
    [InlineData(";MaxPoolSize=18", 18)]
    public void DefaultPoolBudgetIsAppliedUnlessTheConnectionExplicitlyOverridesIt(string suffix, int expected)
    {
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["ConnectionStrings:DefaultConnection"] = "Host=localhost;Database=test;Username=test;Password=test" + suffix,
        }).Build();
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddInfrastructure(configuration);
        using var provider = services.BuildServiceProvider();
        using var scope = provider.CreateScope();
        var connection = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>().Database.GetConnectionString();
        Assert.Equal(expected, new NpgsqlConnectionStringBuilder(connection).MaxPoolSize);
    }
}
