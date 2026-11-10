using System.Security.Claims;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.HttpOverrides;
using System.Net;
using Microsoft.EntityFrameworkCore;
using SchoolAdmission.Domain.Entities;
using SchoolAdmission.Infrastructure.Persistence;

namespace SchoolAdmission.Api.Portal;

public static class PortalSetup
{
    public static void AddPortal(this WebApplicationBuilder builder)
    {
        builder.Services.AddScoped<IPasswordHasher<PortalUser>, PasswordHasher<PortalUser>>();
        builder.Services.Configure<PasswordHasherOptions>(x => x.IterationCount = 210000);
        builder.Services.AddDataProtection().PersistKeysToFileSystem(new DirectoryInfo(builder.Configuration["Portal:KeyPath"] ?? "/app/keys"))
            .SetApplicationName("AdmissionPortal");
        builder.Services.AddAuthentication("Cookies").AddCookie("Cookies", options => {
            options.Cookie.Name = "admission.session"; options.Cookie.HttpOnly = true;
            options.Cookie.SameSite = SameSiteMode.Lax;
            options.Cookie.SecurePolicy = builder.Environment.IsDevelopment() ? CookieSecurePolicy.SameAsRequest : CookieSecurePolicy.Always;
            options.ExpireTimeSpan = TimeSpan.FromHours(8); options.SlidingExpiration = false;
            options.Events = new CookieAuthenticationEvents {
                OnRedirectToLogin = ctx => { ctx.Response.StatusCode = 401; return Task.CompletedTask; },
                OnRedirectToAccessDenied = ctx => { ctx.Response.StatusCode = 403; return Task.CompletedTask; },
                OnValidatePrincipal = async ctx => {
                    var db = ctx.HttpContext.RequestServices.GetRequiredService<ApplicationDbContext>();
                    var user = await db.Users.AsNoTracking().SingleOrDefaultAsync(x => x.Id == ctx.Principal!.FindFirstValue(ClaimTypes.NameIdentifier));
                    if (user == null || !user.EmailVerified || (!builder.Environment.IsDevelopment() && !builder.Environment.IsEnvironment("Testing") && user.Email.EndsWith(".invalid", StringComparison.OrdinalIgnoreCase)) || user.SecurityStamp != ctx.Principal!.FindFirstValue("stamp")) {
                        ctx.RejectPrincipal(); await ctx.HttpContext.SignOutAsync("Cookies");
                    } else ctx.ReplacePrincipal(PortalSecurity.Principal(user));
                }
            };
        });
        builder.Services.AddAuthorization();
        builder.Services.Configure<ForwardedHeadersOptions>(options => {
            options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
            options.KnownProxies.Add(IPAddress.Parse("172.29.210.4"));
            options.KnownProxies.Add(IPAddress.Parse("172.29.210.5"));
            options.ForwardLimit = 1;
        });
        builder.Services.AddAntiforgery(x => { x.HeaderName = "X-CSRF-TOKEN"; x.Cookie.Name = "admission.csrf";
            x.Cookie.SecurePolicy = builder.Environment.IsDevelopment() ? CookieSecurePolicy.SameAsRequest : CookieSecurePolicy.Always; });
        builder.Services.AddRateLimiter(options => {
            options.RejectionStatusCode = 429;
            options.AddPolicy("auth", ctx => RateLimitPartition.GetFixedWindowLimiter(ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                _ => new FixedWindowRateLimiterOptions { PermitLimit = 15, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
            options.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(ctx =>
                RateLimitPartition.GetFixedWindowLimiter(ctx.User.FindFirstValue(ClaimTypes.NameIdentifier) ?? ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                _ => new FixedWindowRateLimiterOptions { PermitLimit = 300, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
        });
        builder.Services.AddHttpClient();
        builder.Services.AddScoped<PaymentGateway>();
        if (!builder.Environment.IsEnvironment("Testing")) builder.Services.AddHostedService<NotificationWorker>();
    }

    public static async Task BootstrapAdmin(IServiceProvider services, IConfiguration config)
    {
        var email = config["Bootstrap:AdminEmail"]?.Trim().ToLowerInvariant();
        var password = config["Bootstrap:AdminPassword"];
        if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(password)) return;
        using var scope = services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        if (await db.Users.AnyAsync(x => x.Email == email)) return;
        PortalSecurity.Password(password);
        var user = new PortalUser { Email = email, Role = "Admin", EmailVerified = true };
        user.PasswordHash = scope.ServiceProvider.GetRequiredService<IPasswordHasher<PortalUser>>().HashPassword(user, password);
        db.Users.Add(user); await db.SaveChangesAsync();
    }

    public static async Task BootstrapDemo(IServiceProvider services, IConfiguration config, IWebHostEnvironment environment)
    {
        if (!config.GetValue<bool>("DemoAccounts:Enabled")) return;
        if (!environment.IsDevelopment()) throw new InvalidOperationException("Demo accounts are allowed only in Development.");
        var password = config["DemoAccounts:Password"] ?? throw new InvalidOperationException("A local demo password is required.");
        using var scope = services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var hasher = scope.ServiceProvider.GetRequiredService<IPasswordHasher<PortalUser>>();
        foreach (var (email, role, name) in new[] { ("admin@demo.invalid", "Admin", "Demo administrator"), ("student@demo.invalid", "Student", "") })
        {
            if (await db.Users.AnyAsync(x => x.Email == email)) continue;
            PortalSecurity.Password(password);
            var user = new PortalUser { Email = email, Role = role, FullName = name, EmailVerified = true };
            user.PasswordHash = hasher.HashPassword(user, password);
            db.Users.Add(user);
        }
        await db.SaveChangesAsync();
    }
}
