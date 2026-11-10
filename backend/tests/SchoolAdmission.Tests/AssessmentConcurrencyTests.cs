using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Npgsql;
using Microsoft.EntityFrameworkCore;
using SchoolAdmission.Infrastructure.Persistence;
using SchoolAdmission.Infrastructure.Persistence.Repositories;
using SchoolAdmission.Application.DTOs;

namespace SchoolAdmission.Tests;

public class AssessmentConcurrencyTests(PostgresFixture database) : IClassFixture<PostgresFixture>
{
    [PostgresFact]
    public async Task ConcurrentConfirmationsAcrossHosts_AllSucceedAndCountOneAdmission()
    {
        using var first = database.CreateAssessmentFactory();
        using var second = database.CreateAssessmentFactory();
        using var a = first.CreateClient();
        using var b = second.CreateClient();
        var classId = await CreateClass(a);
        const string student = "20260000000000009";
        using var created = await a.SendAsync(Request(HttpMethod.Post, $"/classes/{classId}/holds", student));
        var hold = (await created.Content.ReadFromJsonAsync<CreateHoldResponse>())!;
        var start = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var requests = Enumerable.Range(0, 30).Select(async i =>
        {
            await start.Task;
            using var request = Request(HttpMethod.Post, $"/holds/{hold.HoldId}/confirm", student);
            return await (i % 2 == 0 ? a : b).SendAsync(request);
        }).ToArray();
        start.SetResult();
        var results = await Task.WhenAll(requests);
        foreach (var response in results)
        {
            using (response)
            {
                response.StatusCode.Should().Be(HttpStatusCode.OK);
                (await response.Content.ReadFromJsonAsync<ConfirmHoldResponse>())!.Status.Should().Be("CONFIRMED");
            }
        }
        var state = (await b.GetFromJsonAsync<ClassResponse>($"/classes/{classId}"))!;
        state.ConfirmedSeats.Should().Be(1);
        state.HeldSeats.Should().Be(0);
        state.AvailableSeats.Should().Be(0);
    }

    [PostgresFact]
    public async Task ExpiryUpdateWaitingOnConfirmation_RechecksStatusAfterTheCommit()
    {
        using var factory = database.CreateAssessmentFactory();
        using var client = factory.CreateClient();
        var classId = await CreateClass(client);
        using var created = await client.SendAsync(Request(HttpMethod.Post, $"/classes/{classId}/holds", "20260000000000010"));
        var hold = (await created.Content.ReadFromJsonAsync<CreateHoldResponse>())!;
        await using var connection = new NpgsqlConnection(database.ConnectionString);
        await connection.OpenAsync();
        await using var transaction = await connection.BeginTransactionAsync();
        await using var confirm = new NpgsqlCommand(
            "UPDATE seat_holds SET status = 'CONFIRMED', confirmed_at_utc = now() WHERE id = @id", connection, transaction);
        confirm.Parameters.AddWithValue("id", hold.HoldId);
        await confirm.ExecuteNonQueryAsync();

        var applicationName = $"expiry_race_{Guid.NewGuid():N}";
        var workerConnection = new NpgsqlConnectionStringBuilder(database.ConnectionString) { ApplicationName = applicationName };
        var options = new DbContextOptionsBuilder<ApplicationDbContext>().UseNpgsql(workerConnection.ConnectionString).Options;
        await using var context = new ApplicationDbContext(options);
        // A later expiry cutoff models the worker observing an eligible HELD snapshot
        // while an earlier confirmation still owns the row lock.
        var expiry = new HoldRepository(context).ExpireHoldsAsync(DateTime.UtcNow.AddDays(1));
        await using var monitor = new NpgsqlConnection(database.ConnectionString);
        await monitor.OpenAsync();
        var blocked = false;
        for (var attempt = 0; attempt < 50 && !blocked; attempt++)
        {
            await using var activity = new NpgsqlCommand(
                "SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE application_name = @name AND wait_event_type = 'Lock')", monitor);
            activity.Parameters.AddWithValue("name", applicationName);
            blocked = (bool)(await activity.ExecuteScalarAsync())!;
            if (!blocked) await Task.Delay(50);
        }
        // Release even on failure, so the background task cannot retain a blocked connection.
        await transaction.CommitAsync();
        await expiry;
        blocked.Should().BeTrue("the conditional expiry update must overlap an uncommitted confirmation");
        var final = (await client.GetFromJsonAsync<HoldStatusResponse>($"/holds/{hold.HoldId}"))!;
        final.Status.Should().Be("CONFIRMED");
    }

    private static async Task<string> CreateClass(HttpClient client, int seats = 1)
    {
        var response = await client.PostAsJsonAsync("/classes", new { name = "Concurrency Class", totalSeats = seats });
        response.StatusCode.Should().Be(HttpStatusCode.Created);
        return (await response.Content.ReadFromJsonAsync<CreateClassResponse>())!.Id;
    }

    private static HttpRequestMessage Request(HttpMethod method, string url, string student) =>
        new(method, url) { Headers = { { "X-Student-Id", student } } };

    [PostgresFact]
    public async Task TwoApiHosts_ThirtyConcurrentRequests_NeverOversellFiveSeats()
    {
        using var first = database.CreateAssessmentFactory();
        using var second = database.CreateAssessmentFactory();
        using var a = first.CreateClient();
        using var b = second.CreateClient();
        var classId = await CreateClass(a, 5);
        var start = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var requests = Enumerable.Range(1, 30).Select(async i =>
        {
            await start.Task;
            using var request = Request(HttpMethod.Post, $"/classes/{classId}/holds", $"2026{i:D13}");
            return await (i % 2 == 0 ? a : b).SendAsync(request);
        }).ToArray();
        start.SetResult();
        var responses = await Task.WhenAll(requests);
        responses.Count(r => r.StatusCode == HttpStatusCode.Created).Should().Be(5);
        responses.Count(r => r.StatusCode == HttpStatusCode.Conflict).Should().Be(25);
        var state = await a.GetFromJsonAsync<ClassResponse>($"/classes/{classId}");
        (state!.HeldSeats + state.ConfirmedSeats).Should().Be(5);
        foreach (var response in responses) response.Dispose();
    }

    [PostgresFact]
    public async Task SimultaneousDuplicateApplications_OnlyOneSucceeds()
    {
        using var factory = database.CreateAssessmentFactory();
        using var client = factory.CreateClient();
        var classId = await CreateClass(client, 20);
        var responses = await Task.WhenAll(Enumerable.Range(0, 20).Select(_ =>
            client.SendAsync(Request(HttpMethod.Post, $"/classes/{classId}/holds", "20260000000000001"))));
        responses.Count(r => r.StatusCode == HttpStatusCode.Created).Should().Be(1);
        responses.Count(r => r.StatusCode == HttpStatusCode.Conflict).Should().Be(19);
        foreach (var response in responses) response.Dispose();
    }

    [PostgresFact]
    public async Task ConfirmRacingCancellation_HasOneConsistentOutcome()
    {
        using var factory = database.CreateAssessmentFactory();
        using var client = factory.CreateClient();
        var classId = await CreateClass(client);
        const string student = "20260000000000002";
        using var created = await client.SendAsync(Request(HttpMethod.Post, $"/classes/{classId}/holds", student));
        var hold = (await created.Content.ReadFromJsonAsync<CreateHoldResponse>())!;
        var results = await Task.WhenAll(
            client.SendAsync(Request(HttpMethod.Post, $"/holds/{hold.HoldId}/confirm", student)),
            client.SendAsync(Request(HttpMethod.Delete, $"/holds/{hold.HoldId}", student)));
        results.Count(r => r.IsSuccessStatusCode).Should().Be(1);
        results.Count(r => r.StatusCode == HttpStatusCode.Conflict).Should().Be(1);
        var final = (await client.GetFromJsonAsync<HoldStatusResponse>($"/holds/{hold.HoldId}"))!;
        final.Status.Should().Be(results[0].IsSuccessStatusCode ? "CONFIRMED" : "CANCELLED");
        foreach (var response in results) response.Dispose();
    }

    [PostgresFact]
    public async Task ConfirmationWaitingForClassLock_RechecksExpiryBeforeAllocating()
    {
        using var factory = database.CreateAssessmentFactory(2);
        using var client = factory.CreateClient();
        var classId = await CreateClass(client);
        const string student = "20260000000000003";
        using var created = await client.SendAsync(Request(HttpMethod.Post, $"/classes/{classId}/holds", student));
        var hold = (await created.Content.ReadFromJsonAsync<CreateHoldResponse>())!;
        await using var connection = new NpgsqlConnection(database.ConnectionString);
        await connection.OpenAsync();
        await using var transaction = await connection.BeginTransactionAsync();
        await using var command = new NpgsqlCommand("SELECT id FROM classes WHERE id = @id FOR UPDATE", connection, transaction);
        command.Parameters.AddWithValue("id", classId);
        await command.ExecuteScalarAsync();
        var confirm = client.SendAsync(Request(HttpMethod.Post, $"/holds/{hold.HoldId}/confirm", student));
        var delay = hold.ExpiresAt - DateTime.UtcNow + TimeSpan.FromMilliseconds(100);
        if (delay > TimeSpan.Zero) await Task.Delay(delay);
        await transaction.CommitAsync();
        using var result = await confirm;
        result.StatusCode.Should().Be(HttpStatusCode.Conflict);
        using var replacement = await client.SendAsync(Request(HttpMethod.Post, $"/classes/{classId}/holds", "20260000000000004"));
        replacement.StatusCode.Should().Be(HttpStatusCode.Created);
        var state = (await client.GetFromJsonAsync<ClassResponse>($"/classes/{classId}"))!;
        (state.HeldSeats + state.ConfirmedSeats).Should().Be(1);
    }
}
