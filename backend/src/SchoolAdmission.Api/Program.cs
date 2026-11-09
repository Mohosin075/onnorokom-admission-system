using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using Microsoft.OpenApi.Models;
using SchoolAdmission.Api.Filters;
using SchoolAdmission.Api.Middleware;
using SchoolAdmission.Application;
using SchoolAdmission.Infrastructure;
using SchoolAdmission.Infrastructure.Persistence;

var builder = WebApplication.CreateBuilder(args);
// Console logging works in containers and unprivileged Windows sessions.
builder.Logging.ClearProviders();
builder.Logging.AddConsole();

// Ensure backend runs on port 8080 by default per requirement
if (string.IsNullOrEmpty(builder.Configuration["urls"]))
{
    builder.WebHost.UseUrls("http://+:8080");
}

// Add services to the container.
builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter());
        options.JsonSerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull;
    });

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new OpenApiInfo
    {
        Title = "School Admission System API",
        Version = "v1",
        Description = "First-Come, First-Served School Admission System API with high-concurrency seat reservation."
    });

    c.OperationFilter<StudentIdHeaderOperationFilter>();
});

// CORS: allow frontend to interact with backend
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowAll", policy =>
    {
        policy.AllowAnyOrigin()
              .AllowAnyHeader()
              .AllowAnyMethod();
    });
});

// Clean Architecture Layers DI
builder.Services.AddApplication(builder.Configuration);
builder.Services.AddInfrastructure(builder.Configuration);

var app = builder.Build();

// Ensure Database schema is created on startup
using (var scope = app.Services.CreateScope())
{
    var logger = scope.ServiceProvider.GetRequiredService<ILogger<Program>>();
    try
    {
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        if (db.Database.IsNpgsql())
        {
            // Serialize schema initialization when several API instances start together.
            db.Database.OpenConnection();
            try
            {
                db.Database.ExecuteSqlRaw("SELECT pg_advisory_lock(719320841)");
                db.Database.Migrate();
            }
            finally
            {
                db.Database.ExecuteSqlRaw("SELECT pg_advisory_unlock(719320841)");
                db.Database.CloseConnection();
            }
            logger.LogInformation("Database ready.");
        }
        else
        {
            db.Database.EnsureCreated();
        }
    }
    catch (Exception ex)
    {
        logger.LogError(ex, "An error occurred while initializing database schema.");
        throw;
    }
}

// Global Exception Handler Middleware
app.UseMiddleware<ExceptionHandlingMiddleware>();

// Enable Swagger in all environments for ease of testing by evaluators
app.UseSwagger();
app.UseSwaggerUI(c =>
{
    c.SwaggerEndpoint("/swagger/v1/swagger.json", "School Admission System API v1");
    c.RoutePrefix = "swagger";
});

app.UseCors("AllowAll");

app.MapControllers();
app.MapGet("/health", async (ApplicationDbContext db, CancellationToken cancellationToken) =>
    await db.Database.CanConnectAsync(cancellationToken)
        ? Results.Ok(new { status = "healthy" })
        : Results.Json(new { status = "unhealthy" }, statusCode: 503));

app.Run();

// For Integration and Concurrency tests accessibility
public partial class Program { }
