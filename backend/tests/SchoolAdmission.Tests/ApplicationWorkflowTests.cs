using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SchoolAdmission.Domain.Entities;
using SchoolAdmission.Infrastructure.Persistence;

namespace SchoolAdmission.Tests;

public class ApplicationWorkflowTests(PostgresFixture database) : IClassFixture<PostgresFixture>
{
    private const string Password = "IsolatedWorkflowPassword123!";
    private static HttpClient Client(AdmissionFactory factory) => factory.CreateClient(new WebApplicationFactoryClientOptions { BaseAddress = new Uri("https://localhost") });

    private static async Task SignIn(AdmissionFactory factory, HttpClient client, string role = "Student")
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var user = new PortalUser { Email = Guid.NewGuid() + "@example.invalid", Role = role, EmailVerified = true,
            FullName = "Isolated workflow applicant", BirthRegistration = "2026" + Random.Shared.NextInt64(1000000000000, 9999999999999),
            DateOfBirth = new DateTime(2014, 1, 1, 0, 0, 0, DateTimeKind.Utc), GuardianName = "Isolated guardian",
            Phone = "01700000000", Address = "Isolated application test address" };
        user.PasswordHash = scope.ServiceProvider.GetRequiredService<IPasswordHasher<PortalUser>>().HashPassword(user, Password);
        db.Users.Add(user); await db.SaveChangesAsync();
        await Csrf(client);
        (await client.PostAsJsonAsync("/auth/login", new { user.Email, Password })).StatusCode.Should().Be(HttpStatusCode.OK);
        await Csrf(client);
    }

    private static async Task Csrf(HttpClient client)
    {
        var csrf = await client.GetFromJsonAsync<JsonElement>("/auth/csrf");
        client.DefaultRequestHeaders.Remove("X-CSRF-TOKEN");
        client.DefaultRequestHeaders.Add("X-CSRF-TOKEN", csrf.GetProperty("token").GetString());
    }

    private static async Task<string> Upload(HttpClient client, string kind)
    {
        using var form = new MultipartFormDataContent(); form.Add(new StringContent(kind), "kind");
        form.Add(new ByteArrayContent(Convert.FromBase64String("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6V8AAAAASUVORK5CYII=")), "file", kind + ".png");
        var response = await client.PostAsync("/profile/documents", form);
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        return (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetString()!;
    }

    private static async Task<string> OpenClass(HttpClient admin)
    {
        var response = await admin.PostAsJsonAsync("/admin/classes", new { name = "Isolated review class", totalSeats = 1, fee = 500 });
        response.StatusCode.Should().Be(HttpStatusCode.Created);
        return (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetString()!;
    }

    private static async Task<string> Submit(HttpClient student, string classId)
    {
        var response = await student.PostAsJsonAsync("/applications", new { classId });
        response.StatusCode.Should().BeOneOf(HttpStatusCode.Created, HttpStatusCode.OK);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        body.GetProperty("status").GetString().Should().Be("PendingReview");
        return body.GetProperty("id").GetString()!;
    }

    private static async Task<HttpResponseMessage> Approve(HttpClient admin, string id, int version = 1)
    {
        var detail = await admin.GetFromJsonAsync<JsonElement>("/admin/applications/" + id);
        var ids = detail.GetProperty("documents").EnumerateArray().Select(x => x.GetProperty("id").GetString()).ToArray();
        return await admin.PutAsJsonAsync($"/admin/applications/{id}/review", new { status = "Approved", version, reviewedDocumentIds = ids });
    }

    [PostgresFact]
    public async Task PendingDocumentsCanBeSubmitted_WithClassAndApplicantContext_WithoutReservingASeat()
    {
        using var factory = database.CreateFactory(2100); using var student = Client(factory); using var admin = Client(factory); using var other = Client(factory);
        await SignIn(factory, student); await SignIn(factory, admin, "Admin"); await SignIn(factory, other);
        var classId = await OpenClass(admin);
        (await student.PostAsJsonAsync("/applications", new { classId })).StatusCode.Should().Be(HttpStatusCode.BadRequest);
        await Upload(student, "BirthCertificate"); await Upload(student, "Photograph");
        var id = await Submit(student, classId);
        var detail = await admin.GetFromJsonAsync<JsonElement>("/admin/applications/" + id);
        detail.GetProperty("classId").GetString().Should().Be(classId);
        detail.GetProperty("applicant").GetProperty("guardianName").GetString().Should().Be("Isolated guardian");
        detail.GetProperty("documents").GetArrayLength().Should().Be(2);
        (await student.GetFromJsonAsync<JsonElement>("/me/holds")).GetArrayLength().Should().Be(0);
        (await student.GetFromJsonAsync<JsonElement>("/applications/mine")).EnumerateArray().Should().Contain(x => x.GetProperty("id").GetString() == id);
        (await other.GetFromJsonAsync<JsonElement>("/applications/mine")).GetArrayLength().Should().Be(0);
        (await student.GetAsync("/admin/applications/" + id)).StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await student.PostAsJsonAsync($"/classes/{classId}/holds", new { })).StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await student.PostAsJsonAsync("/applications", new { classId })).StatusCode.Should().Be(HttpStatusCode.Conflict);
        var cls = await student.GetFromJsonAsync<JsonElement>("/classes/" + classId);
        cls.GetProperty("availableSeats").GetInt32().Should().Be(1);
        cls.GetProperty("heldSeats").GetInt32().Should().Be(0);
    }

    [PostgresFact]
    public async Task CorrectionsCreateNewSubmissionVersion_WithoutReplacingPreviouslySubmittedFiles()
    {
        using var factory = database.CreateFactory(2100); using var student = Client(factory); using var admin = Client(factory);
        await SignIn(factory, student); await SignIn(factory, admin, "Admin"); var classId = await OpenClass(admin);
        var originalBirth = await Upload(student, "BirthCertificate"); await Upload(student, "Photograph"); var id = await Submit(student, classId);
        var newBirth = await Upload(student, "BirthCertificate");
        var account = await student.GetFromJsonAsync<JsonElement>("/auth/me");
        var correctedProfile = new { fullName = "Corrected isolated applicant", birthRegistration = account.GetProperty("birthRegistration").GetString(), dateOfBirth = "2014-01-01", guardianName = "Isolated guardian", phone = "01700000000", address = "Isolated corrected test address" };
        (await student.PutAsJsonAsync("/profile", correctedProfile)).StatusCode.Should().Be(HttpStatusCode.Conflict);
        var original = await admin.GetFromJsonAsync<JsonElement>("/admin/applications/" + id);
        original.GetProperty("documents").EnumerateArray().Should().Contain(d => d.GetProperty("id").GetString() == originalBirth);
        original.GetProperty("documents").EnumerateArray().Should().NotContain(d => d.GetProperty("id").GetString() == newBirth);
        (await admin.PutAsJsonAsync($"/admin/applications/{id}/review", new { status = "ChangesRequested", version = 1, note = "Please upload a clearer certificate." })).StatusCode.Should().Be(HttpStatusCode.OK);
        (await student.PutAsJsonAsync("/profile", correctedProfile)).StatusCode.Should().Be(HttpStatusCode.OK);
        (await student.GetFromJsonAsync<JsonElement>("/applications/mine")).EnumerateArray().Single(x => x.GetProperty("id").GetString() == id).GetProperty("reviewNote").GetString().Should().Contain("clearer");
        (await Submit(student, classId)).Should().Be(id);
        var updated = await admin.GetFromJsonAsync<JsonElement>("/admin/applications/" + id);
        updated.GetProperty("version").GetInt32().Should().Be(2);
        updated.GetProperty("reviewNote").GetString().Should().Contain("clearer certificate");
        updated.GetProperty("applicant").GetProperty("fullName").GetString().Should().Be("Corrected isolated applicant");
        updated.GetProperty("documents").EnumerateArray().Should().Contain(d => d.GetProperty("id").GetString() == newBirth);
        (await admin.GetAsync($"/profile/documents/{originalBirth}/download")).StatusCode.Should().Be(HttpStatusCode.OK);
        (await Approve(admin, id, 1)).StatusCode.Should().Be(HttpStatusCode.Conflict);
        (await Approve(admin, id, 2)).StatusCode.Should().Be(HttpStatusCode.OK);
        (await student.GetFromJsonAsync<JsonElement>("/me/holds")).GetArrayLength().Should().Be(0);
        (await student.PostAsJsonAsync($"/classes/{classId}/holds", new { })).StatusCode.Should().Be(HttpStatusCode.Created);
        var hold = (await student.GetFromJsonAsync<JsonElement>("/me/holds")).EnumerateArray().Single(x => x.GetProperty("classId").GetString() == classId);
        hold.GetProperty("expiresAt").GetDateTime().Should().BeAfter(DateTime.UtcNow.AddMinutes(30));
    }

    [PostgresFact]
    public async Task ReviewRequiresDocumentAcknowledgment_AndReasons_ForChangesOrRejection()
    {
        using var factory = database.CreateFactory(); using var student = Client(factory); using var admin = Client(factory);
        await SignIn(factory, student); await SignIn(factory, admin, "Admin"); var classId = await OpenClass(admin);
        await Upload(student, "BirthCertificate"); await Upload(student, "Photograph"); var id = await Submit(student, classId);
        foreach (var decision in new[] { "Approved", "ChangesRequested", "Rejected" })
            (await admin.PutAsJsonAsync($"/admin/applications/{id}/review", new { status = decision, version = 1 })).StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await admin.PutAsJsonAsync($"/admin/applications/{id}/review", new { status = "Rejected", version = 1, note = "Applicant does not meet the class requirements." })).StatusCode.Should().Be(HttpStatusCode.OK);
        (await Approve(admin, id)).StatusCode.Should().Be(HttpStatusCode.Conflict);
        (await student.PostAsJsonAsync("/applications", new { classId })).StatusCode.Should().Be(HttpStatusCode.Conflict);
    }

    [PostgresFact]
    public async Task ApprovedApplicationsCompeteForCapacityOnlyWhenStudentsReserve()
    {
        using var factory = database.CreateFactory(2100); using var first = Client(factory); using var second = Client(factory); using var admin = Client(factory);
        await SignIn(factory, first); await SignIn(factory, second); await SignIn(factory, admin, "Admin"); var classId = await OpenClass(admin);
        foreach (var student in new[] { first, second })
        {
            await Upload(student, "BirthCertificate"); await Upload(student, "Photograph"); var id = await Submit(student, classId);
            (await Approve(admin, id)).StatusCode.Should().Be(HttpStatusCode.OK);
        }
        var before = await admin.GetFromJsonAsync<JsonElement>("/classes/" + classId); before.GetProperty("heldSeats").GetInt32().Should().Be(0);
        var results = await Task.WhenAll(new[] { first, second }.Select(client => client.PostAsJsonAsync($"/classes/{classId}/holds", new { })));
        results.Count(x => x.StatusCode == HttpStatusCode.Created).Should().Be(1);
        results.Count(x => x.StatusCode == HttpStatusCode.Conflict).Should().Be(1);
        foreach (var result in results) result.Dispose();
    }
}
