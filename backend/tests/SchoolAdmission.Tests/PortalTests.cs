using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using FluentAssertions;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Configuration;
using SchoolAdmission.Api.Portal;
using SchoolAdmission.Application.DTOs;
using SchoolAdmission.Application.Interfaces;
using SchoolAdmission.Domain.Entities;
using SchoolAdmission.Domain.Exceptions;
using SchoolAdmission.Infrastructure.Persistence;

namespace SchoolAdmission.Tests;

// Accounts and documents below exist only inside disposable school_admission_tests_* databases.
public class PortalTests(PostgresFixture database) : IClassFixture<PostgresFixture>
{
    private const string Password = "IsolatedTestPassword123!";
    private static async Task Csrf(HttpClient client)
    {
        var value = await client.GetFromJsonAsync<System.Text.Json.JsonElement>("/auth/csrf");
        client.DefaultRequestHeaders.Remove("X-CSRF-TOKEN");
        client.DefaultRequestHeaders.Add("X-CSRF-TOKEN", value.GetProperty("token").GetString());
    }
    private static async Task<PortalUser> Seed(AdmissionFactory factory, string role = "Student", string? birth = null)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var user = new PortalUser { Email = Guid.NewGuid()+"@example.invalid", EmailVerified = true, Role = role,
            BirthRegistration = birth, FullName = "Isolated test applicant", GuardianName = "Isolated guardian", Phone = "01700000000", Address = "Isolated database only" };
        user.PasswordHash = scope.ServiceProvider.GetRequiredService<IPasswordHasher<PortalUser>>().HashPassword(user, Password);
        db.Users.Add(user); await db.SaveChangesAsync(); return user;
    }
    private static async Task Login(HttpClient client, PortalUser user)
    {
        await Csrf(client);
        var response = await client.PostAsJsonAsync("/auth/login", new { user.Email, Password });
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        await Csrf(client);
    }

    [PostgresFact]
    public async Task AnonymousAndForgedStudentHeader_CannotReadPrivateRecordsOrCreateClasses()
    {
        using var factory = database.CreateFactory(); using var client = factory.CreateClient(new Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactoryClientOptions { BaseAddress = new Uri("https://localhost") });
        client.DefaultRequestHeaders.Add("X-Student-Id", "20260000000000001");
        (await client.GetAsync("/me/holds")).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        (await client.GetAsync("/holds/unknown")).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        (await client.PostAsJsonAsync("/classes",new{name="Unauthorized",totalSeats=1})).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        (await client.GetAsync("/admin/overview")).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [PostgresFact]
    public async Task LoginRequiresCsrf_StudentCannotAccessAdmin_LogoutRevokesBrowserSession()
    {
        using var factory = database.CreateFactory(); using var client = factory.CreateClient(new Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactoryClientOptions { BaseAddress = new Uri("https://localhost") }); var user = await Seed(factory);
        (await client.PostAsJsonAsync("/auth/login",new{user.Email,Password})).StatusCode.Should().Be(HttpStatusCode.BadRequest);
        await Login(client,user);
        (await client.GetAsync("/admin/overview")).StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await client.PostAsJsonAsync("/classes",new{name="Denied",totalSeats=1})).StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await client.PostAsync("/auth/logout",null)).StatusCode.Should().Be(HttpStatusCode.NoContent);
        (await client.GetAsync("/auth/me")).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [PostgresFact]
    public async Task AdminCreatesClassAndFeeAtomically_SearchFiltersExecuteInPostgres()
    {
        using var factory = database.CreateFactory(); using var client = factory.CreateClient(new Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactoryClientOptions { BaseAddress = new Uri("https://localhost") }); await Login(client,await Seed(factory,"Admin"));
        var created=await client.PostAsJsonAsync("/admin/classes",new{name="Isolated capacity test",totalSeats=3,fee=500.50});
        created.StatusCode.Should().Be(HttpStatusCode.Created);
        var cls=(await created.Content.ReadFromJsonAsync<CreateClassResponse>())!;
        using var scope=factory.Services.CreateScope();var db=scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        (await db.Fees.SingleAsync(x=>x.ClassId==cls.Id)).Amount.Should().Be(500.50m);
        foreach(var status in new[]{"","HELD","CONFIRMED","EXPIRED","CANCELLED"})
            (await client.GetAsync("/admin/applications?search=isolated&status="+status)).StatusCode.Should().Be(HttpStatusCode.OK);
        (await client.GetAsync("/admin/overview")).StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [PostgresFact]
    public async Task ProfileBindingIsUnique_AnotherAccountCannotReadHold_ConfirmationBypassIsGone()
    {
        using var factory=database.CreateFactory();using var a=factory.CreateClient(new Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactoryClientOptions { BaseAddress = new Uri("https://localhost") });using var b=factory.CreateClient(new Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactoryClientOptions { BaseAddress = new Uri("https://localhost") });
        var birth="20260000000000011";var owner=await Seed(factory,birth:birth);var other=await Seed(factory);
        await Login(a,owner);await Login(b,other);
        var input=new{fullName="Isolated applicant",birthRegistration=birth,dateOfBirth="2015-01-01",guardianName="Isolated guardian",phone="01700000000",address="Isolated test address only"};
        (await b.PutAsJsonAsync("/profile",input)).StatusCode.Should().Be(HttpStatusCode.Conflict);
        using var scope=factory.Services.CreateScope();var db=scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var cls=new ClassRoom("c_"+Guid.NewGuid().ToString("N"),"Isolated ownership",1);db.Classes.Add(cls);
        var hold=new SeatHold("h_"+Guid.NewGuid().ToString("N"),cls.Id,birth,2100);db.Holds.Add(hold);await db.SaveChangesAsync();
        (await a.GetAsync("/holds/"+hold.Id)).StatusCode.Should().Be(HttpStatusCode.OK);
        (await b.GetAsync("/holds/"+hold.Id)).StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await a.PostAsJsonAsync("/holds/"+hold.Id+"/confirm",new{})).StatusCode.Should().Be(HttpStatusCode.Gone);
        (await a.PostAsJsonAsync("/payments/"+hold.Id+"/checkout",new{})).StatusCode.Should().Be(HttpStatusCode.ServiceUnavailable);
        (await b.GetAsync("/downloads/"+hold.Id+"/receipt")).StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [PostgresFact]
    public async Task DocumentsArePrivate_ActiveContentIsRejected_ApprovalIsRequiredToReserve()
    {
        using var factory=database.CreateFactory();using var a=factory.CreateClient(new Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactoryClientOptions { BaseAddress = new Uri("https://localhost") });using var b=factory.CreateClient(new Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactoryClientOptions { BaseAddress = new Uri("https://localhost") });
        var owner=await Seed(factory,birth:"20260000000000012");await Login(a,owner);await Login(b,await Seed(factory));
        using var form=new MultipartFormDataContent();form.Add(new StringContent("BirthCertificate"),"kind");form.Add(new ByteArrayContent(Encoding.UTF8.GetBytes("<script>alert(1)</script>")),"file","bad.png");
        (await a.PostAsync("/profile/documents",form)).StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await b.GetAsync("/profile/documents/missing/download")).StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await a.PostAsJsonAsync("/classes/unknown/holds",new{})).StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [PostgresFact]
    public async Task SignedPaymentCallbackIsRequired_UnsignedCallbackCannotConfirm()
    {
        using var factory=database.CreateFactory();using var client=factory.CreateClient(new Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactoryClientOptions { BaseAddress = new Uri("https://localhost") });
        (await client.PostAsJsonAsync("/payments/stripe/webhook",new{type="checkout.session.completed"})).StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [PostgresFact]
    public async Task StandaloneDocumentApprovalIsDisabled_AndOnlyOwnerOrAdminCanDownload()
    {
        using var factory=database.CreateFactory();
        using var owner=factory.CreateClient(new Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactoryClientOptions { BaseAddress=new Uri("https://localhost") });
        using var other=factory.CreateClient(new Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactoryClientOptions { BaseAddress=new Uri("https://localhost") });
        using var admin=factory.CreateClient(new Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactoryClientOptions { BaseAddress=new Uri("https://localhost") });
        await Login(owner,await Seed(factory,birth:"20260000000000013"));await Login(other,await Seed(factory));await Login(admin,await Seed(factory,"Admin"));
        using var form=new MultipartFormDataContent();form.Add(new StringContent("Photograph"),"kind");
        form.Add(new ByteArrayContent(Convert.FromBase64String("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6V8AAAAASUVORK5CYII=")),"file","isolated.png");
        var uploaded=await owner.PostAsync("/profile/documents",form);uploaded.StatusCode.Should().Be(HttpStatusCode.OK);
        var json=await uploaded.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>();var id=json.GetProperty("id").GetString();
        (await owner.GetAsync($"/profile/documents/{id}/download")).StatusCode.Should().Be(HttpStatusCode.OK);
        (await other.GetAsync($"/profile/documents/{id}/download")).StatusCode.Should().Be(HttpStatusCode.NotFound);
        using var scope=factory.Services.CreateScope();var db=scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();var document=await db.Documents.SingleAsync(x=>x.Id==id);
        (await admin.PutAsJsonAsync($"/admin/documents/{id}/review",new{status="Approved",sha256=document.Sha256})).StatusCode.Should().Be(HttpStatusCode.Gone);
        await db.Entry(document).ReloadAsync();document.ReviewStatus.Should().Be("Uploaded");
        System.IO.File.Delete(System.IO.Path.Combine("/app/uploads",document.StorageKey));
    }

    [PostgresFact]
    public async Task PasswordResetIsSingleUse_AndRevokesPreviouslyAuthenticatedSessions()
    {
        using var factory=database.CreateFactory();
        using var signedIn=factory.CreateClient(new Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactoryClientOptions { BaseAddress=new Uri("https://localhost") });
        using var recovery=factory.CreateClient(new Microsoft.AspNetCore.Mvc.Testing.WebApplicationFactoryClientOptions { BaseAddress=new Uri("https://localhost") });
        var user=await Seed(factory);await Login(signedIn,user);
        var raw=Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
        using(var scope=factory.Services.CreateScope()){var db=scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();db.AccountTokens.Add(new AccountToken{Id=PortalSecurity.TokenHash(raw),UserId=user.Id,Purpose="reset",ExpiresAt=DateTime.UtcNow.AddMinutes(5)});await db.SaveChangesAsync();}
        await Csrf(recovery);
        var input=new{token=raw,password="ChangedIsolatedPassword123!"};
        (await recovery.PostAsJsonAsync("/auth/reset-password",input)).StatusCode.Should().Be(HttpStatusCode.OK);
        (await recovery.PostAsJsonAsync("/auth/reset-password",input)).StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await signedIn.GetAsync("/auth/me")).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        (await recovery.PostAsJsonAsync("/auth/login",new{user.Email,Password=input.password})).StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public void WebhookSignatureRejectsTamperingAndStaleTimestamps()
    {
        const string secret="whsec_isolated_unit_test";const string body="{\"id\":\"isolated\"}";
        var config=new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string,string?>{["Stripe:WebhookSecret"]=secret}).Build();
        var gateway=new PaymentGateway(null!,config);
        string Signature(long time,string payload)=>$"t={time},v1={Convert.ToHexString(HMACSHA256.HashData(Encoding.UTF8.GetBytes(secret),Encoding.UTF8.GetBytes(time+"."+payload)))}";
        var now=DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        gateway.VerifySignature(body,Signature(now,body)).Should().BeTrue();
        gateway.VerifySignature(body+" ",Signature(now,body)).Should().BeFalse();
        gateway.VerifySignature(body,Signature(now-600,body)).Should().BeFalse();
        gateway.VerifySignature(body,"invalid").Should().BeFalse();
    }
}
