using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Npgsql;
using SchoolAdmission.Application.DTOs;

namespace SchoolAdmission.Tests;

public class ConcurrencyTests(PostgresFixture database) : IClassFixture<PostgresFixture>
{
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
        using var first = database.CreateFactory();
        using var second = database.CreateFactory();
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
        using var factory = database.CreateFactory();
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
        using var factory = database.CreateFactory();
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
        using var factory = database.CreateFactory(2);
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
