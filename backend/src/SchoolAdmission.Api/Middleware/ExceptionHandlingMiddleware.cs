using System.Net;
using System.Text.Json;
using SchoolAdmission.Domain.Exceptions;

namespace SchoolAdmission.Api.Middleware;

public class ExceptionHandlingMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<ExceptionHandlingMiddleware> _logger;

    public ExceptionHandlingMiddleware(RequestDelegate next, ILogger<ExceptionHandlingMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await _next(context);
        }
        catch (Exception ex)
        {
            await HandleExceptionAsync(context, ex);
        }
    }

    private async Task HandleExceptionAsync(HttpContext context, Exception exception)
    {
        var statusCode = HttpStatusCode.InternalServerError;
        var errorTitle = "Internal Server Error";
        var errorMessage = exception.Message;

        switch (exception)
        {
            case EntityNotFoundException:
                statusCode = HttpStatusCode.NotFound;
                errorTitle = "Not Found";
                break;

            case ConflictException:
                statusCode = HttpStatusCode.Conflict;
                errorTitle = "Conflict";
                break;

            case ValidationException:
            case ArgumentException:
                statusCode = HttpStatusCode.BadRequest;
                errorTitle = "Bad Request";
                break;

            case UnauthorizedAccessException:
                statusCode = HttpStatusCode.Forbidden;
                errorTitle = "Forbidden";
                break;

            default:
                _logger.LogError(exception, "Unhandled exception occurred: {Message}", exception.Message);
                errorMessage = "An unexpected error occurred. Please try again later.";
                break;
        }

        context.Response.ContentType = "application/json";
        context.Response.StatusCode = (int)statusCode;

        var response = new
        {
            status = (int)statusCode,
            error = errorTitle,
            message = errorMessage,
            timestamp = DateTime.UtcNow
        };

        var json = JsonSerializer.Serialize(response, new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase
        });

        await context.Response.WriteAsync(json);
    }
}
