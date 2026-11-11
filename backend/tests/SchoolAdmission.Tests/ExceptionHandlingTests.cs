using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging.Abstractions;
using Npgsql;
using SchoolAdmission.Api.Middleware;

namespace SchoolAdmission.Tests;

public class ExceptionHandlingTests
{
    [Fact]
    public async Task DisconnectedRequestDoesNotProduceAnInternalServerError()
    {
        var context = new DefaultHttpContext { RequestAborted = new CancellationToken(true) };
        var middleware = new ExceptionHandlingMiddleware(_ => throw new OperationCanceledException(),
            NullLogger<ExceptionHandlingMiddleware>.Instance);
        await middleware.InvokeAsync(context);
        Assert.Equal(499, context.Response.StatusCode);
    }

    [Fact]
    public async Task TemporaryDatabaseFailureReturnsRetryableResponseWithoutExposingDetails()
    {
        var context = new DefaultHttpContext();
        context.Response.Body = new MemoryStream();
        var middleware = new ExceptionHandlingMiddleware(_ => throw new NpgsqlException("private connection detail", new TimeoutException()),
            NullLogger<ExceptionHandlingMiddleware>.Instance);
        await middleware.InvokeAsync(context);
        Assert.Equal(503, context.Response.StatusCode);
        Assert.Equal("1", context.Response.Headers.RetryAfter.ToString());
        context.Response.Body.Position = 0;
        Assert.DoesNotContain("private connection detail", await new StreamReader(context.Response.Body).ReadToEndAsync());
    }
}
