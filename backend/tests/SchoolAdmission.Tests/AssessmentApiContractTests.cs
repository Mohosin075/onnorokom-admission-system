using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using SchoolAdmission.Application.DTOs;
using SchoolAdmission.Domain.Entities;
using SchoolAdmission.Infrastructure.Persistence;

namespace SchoolAdmission.Tests;

public class AssessmentApiContractTests(PostgresFixture database) : IClassFixture<PostgresFixture>
{
    [PostgresFact]
    public async Task AssessmentRoutesUseOnlyThePdfAdmissionSurface_WithoutPortalAuthentication()
    {
        using var factory = database.CreateAssessmentFactory();
        using var client = factory.CreateClient();
        (await client.GetAsync("/auth/me")).StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await client.GetAsync("/admin/overview")).StatusCode.Should().Be(HttpStatusCode.NotFound);
        var document = await client.GetFromJsonAsync<System.Text.Json.JsonElement>("/swagger/v1/swagger.json");
        var paths = document.GetProperty("paths");
        foreach (var path in new[] { "/classes", "/classes/{classId}", "/classes/{classId}/holds", "/holds/{holdId}", "/holds/{holdId}/confirm", "/me/holds" })
            paths.TryGetProperty(path, out _).Should().BeTrue();
        paths.EnumerateObject().Should().NotContain(x => x.Name.StartsWith("/auth") || x.Name.StartsWith("/applications") || x.Name.StartsWith("/payments"));
    }

    private const string Student = "20261111222233334";
    private static HttpRequestMessage Request(HttpMethod method, string path, string student = Student) =>
        new(method, path) { Headers = { { "X-Student-Id", student } } };

    [PostgresFact]
    public async Task FullAdmissionContract_ValidatesOwnershipAndIdempotency()
    {
        using var factory = database.CreateAssessmentFactory();
        using var client = factory.CreateClient();
        using var created = await client.PostAsJsonAsync("/classes", new { name = "Class 6 - Morning", totalSeats = 1 });
        created.StatusCode.Should().Be(HttpStatusCode.Created);
        var cls = (await created.Content.ReadFromJsonAsync<CreateClassResponse>())!;
        using var reserved = await client.SendAsync(Request(HttpMethod.Post, $"/classes/{cls.Id}/holds"));
        reserved.StatusCode.Should().Be(HttpStatusCode.Created);
        var hold = (await reserved.Content.ReadFromJsonAsync<CreateHoldResponse>())!;
        hold.StudentId.Should().Be(Student);
        hold.Status.Should().Be("HELD");
        hold.ExpiresAt.Kind.Should().Be(DateTimeKind.Utc);

        using var wrongOwner = await client.SendAsync(Request(HttpMethod.Post, $"/holds/{hold.HoldId}/confirm", "20261111222233335"));
        wrongOwner.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        using var wrongCancel = await client.SendAsync(Request(HttpMethod.Delete, $"/holds/{hold.HoldId}", "20261111222233335"));
        wrongCancel.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        for (var attempt = 0; attempt < 3; attempt++)
        {
            using var confirmation = await client.SendAsync(Request(HttpMethod.Post, $"/holds/{hold.HoldId}/confirm"));
            confirmation.StatusCode.Should().Be(HttpStatusCode.OK);
            (await confirmation.Content.ReadFromJsonAsync<ConfirmHoldResponse>())!.Status.Should().Be("CONFIRMED");
        }
        var state = (await client.GetFromJsonAsync<ClassResponse>($"/classes/{cls.Id}"))!;
        state.ConfirmedSeats.Should().Be(1);
        state.HeldSeats.Should().Be(0);
        state.AvailableSeats.Should().Be(0);
        using var historyResponse = await client.SendAsync(Request(HttpMethod.Get, "/me/holds"));
        var history = (await historyResponse.Content.ReadFromJsonAsync<List<StudentHoldResponse>>())!;
        history.Should().Contain(h => h.HoldId == hold.HoldId && h.ClassName == cls.Name && h.Status == "CONFIRMED");
        using var cancel = await client.SendAsync(Request(HttpMethod.Delete, $"/holds/{hold.HoldId}"));
        cancel.StatusCode.Should().Be(HttpStatusCode.Conflict);

        // Another API host sees the same persisted admission after the first stops.
        factory.Dispose();
        using var restarted = database.CreateAssessmentFactory();
        using var restartedClient = restarted.CreateClient();
        var restored = (await restartedClient.GetFromJsonAsync<HoldStatusResponse>($"/holds/{hold.HoldId}"))!;
        restored.Status.Should().Be("CONFIRMED");
    }

    [PostgresFact]
    public async Task InvalidRequests_ReturnClientErrorsInsteadOfServerErrors()
    {
        using var factory = database.CreateAssessmentFactory();
        using var client = factory.CreateClient();
        foreach (var payload in new[] {
            new { name = new string('a', 201), totalSeats = 1 },
            new { name = " ", totalSeats = 1 },
            new { name = "Invalid seats", totalSeats = 0 } })
        {
            using var response = await client.PostAsJsonAsync("/classes", payload);
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        }
        using var malformed = await client.PostAsync("/classes", new StringContent("{", System.Text.Encoding.UTF8, "application/json"));
        malformed.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        using var missing = await client.PostAsync("/classes/missing/holds", null);
        missing.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        using var invalid = await client.SendAsync(Request(HttpMethod.Get, "/me/holds", "123"));
        invalid.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        using var unknown = await client.GetAsync("/holds/missing");
        unknown.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [PostgresFact]
    public async Task ExpiredHold_IsCleanedByWorkerWithoutCallingAnyAdmissionEndpoint()
    {
        using var factory = database.CreateAssessmentFactory(1);
        using var client = factory.CreateClient();
        using var created = await client.PostAsJsonAsync("/classes", new { name = "Expiry", totalSeats = 1 });
        var cls = (await created.Content.ReadFromJsonAsync<CreateClassResponse>())!;
        using var reserved = await client.SendAsync(Request(HttpMethod.Post, $"/classes/{cls.Id}/holds"));
        var hold = (await reserved.Content.ReadFromJsonAsync<CreateHoldResponse>())!;
        await using var connection = new NpgsqlConnection(database.ConnectionString);
        await connection.OpenAsync();
        string? status = null;
        for (var attempt = 0; attempt < 80; attempt++)
        {
            await Task.Delay(100);
            await using var command = new NpgsqlCommand("SELECT status FROM seat_holds WHERE id = @id", connection);
            command.Parameters.AddWithValue("id", hold.HoldId);
            status = (string?)await command.ExecuteScalarAsync();
            if (status == "EXPIRED") break;
        }
        status.Should().Be("EXPIRED");
        using var confirmation = await client.SendAsync(Request(HttpMethod.Post, $"/holds/{hold.HoldId}/confirm"));
        confirmation.StatusCode.Should().Be(HttpStatusCode.Conflict);
        var state = (await client.GetFromJsonAsync<ClassResponse>($"/classes/{cls.Id}"))!;
        state.AvailableSeats.Should().Be(1);
        using var replacement = await client.SendAsync(Request(HttpMethod.Post, $"/classes/{cls.Id}/holds"));
        replacement.StatusCode.Should().Be(HttpStatusCode.Created);
    }

    [PostgresFact]
    public async Task Migration_AdoptsExistingEnsureCreatedDatabaseWithoutDataLoss()
    {
        // This class's fixture is already shared by other tests, so use another isolated database.
        var isolated = new PostgresFixture();
        await isolated.InitializeAsync();
        try
        {
            var options = new DbContextOptionsBuilder<LegacySchemaContext>().UseNpgsql(isolated.ConnectionString).Options;
            await using (var context = new LegacySchemaContext(options))
            {
                await context.Database.EnsureCreatedAsync();
                context.Classes.Add(new ClassRoom("c_existing", "Existing class", 3));
                await context.SaveChangesAsync();
            }
            using var factory = isolated.CreateAssessmentFactory();
            using var client = factory.CreateClient();
            var restored = await client.GetFromJsonAsync<ClassResponse>("/classes/c_existing");
            restored!.TotalSeats.Should().Be(3);
        }
        finally { await isolated.DisposeAsync(); }
    }

    private sealed class LegacySchemaContext(DbContextOptions<LegacySchemaContext> options) : DbContext(options)
    {
        public DbSet<ClassRoom> Classes => Set<ClassRoom>();
        protected override void OnModelCreating(ModelBuilder model)
        {
            model.ApplyConfiguration(new SchoolAdmission.Infrastructure.Persistence.Configurations.ClassRoomConfiguration());
            model.ApplyConfiguration(new SchoolAdmission.Infrastructure.Persistence.Configurations.SeatHoldConfiguration());
        }
    }
}
