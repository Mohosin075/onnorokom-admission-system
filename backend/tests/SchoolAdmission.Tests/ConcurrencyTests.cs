using System.Collections.Concurrent;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using SchoolAdmission.Application.Common;
using SchoolAdmission.Application.Services;
using SchoolAdmission.Domain.Entities;
using SchoolAdmission.Domain.Exceptions;
using SchoolAdmission.Infrastructure.Persistence;
using SchoolAdmission.Infrastructure.Persistence.Repositories;
using Xunit;

namespace SchoolAdmission.Tests;

public class ConcurrencyTests
{
    [Fact]
    public async Task CreateHold_UnderHighConcurrency_NeverOversellsSeats()
    {
        // Arrange: Class with only 5 seats
        const int totalSeats = 5;
        const int concurrentRequests = 30;
        var classId = $"c_concurrency_{Guid.NewGuid():N}";

        var dbOptions = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: $"ConcurrencyDb_{Guid.NewGuid():N}")
            .Options;

        // Seed initial class
        using (var initialContext = new ApplicationDbContext(dbOptions))
        {
            var testClass = new ClassRoom(classId, "Class 6 - Morning Concurrency", totalSeats);
            await initialContext.Classes.AddAsync(testClass);
            await initialContext.SaveChangesAsync();
        }

        var holdOptions = Options.Create(new HoldOptions { HoldDurationSeconds = 600 });
        var successHolds = new ConcurrentBag<string>();
        var conflictFailures = new ConcurrentBag<string>();
        var unexpectedExceptions = new ConcurrentBag<Exception>();

        // Concurrency lock for simulating DB row-level lock in In-Memory provider
        var rowLock = new SemaphoreSlim(1, 1);

        // Act: 30 students trying to hold seats at the exact same instant
        var tasks = Enumerable.Range(1, concurrentRequests).Select(async i =>
        {
            // 17-digit student IDs
            var studentId = $"2026{i:D13}";

            using var context = new ApplicationDbContext(dbOptions);
            var classRepo = new ClassRepository(context);
            var holdRepo = new HoldRepository(context);
            var unitOfWork = new UnitOfWork(context);
            var holdService = new HoldService(classRepo, holdRepo, unitOfWork, holdOptions);

            try
            {
                await rowLock.WaitAsync();
                try
                {
                    var response = await holdService.CreateHoldAsync(classId, studentId);
                    successHolds.Add(response.HoldId);
                }
                finally
                {
                    rowLock.Release();
                }
            }
            catch (ConflictException ex)
            {
                conflictFailures.Add(ex.Message);
            }
            catch (Exception ex)
            {
                unexpectedExceptions.Add(ex);
            }
        });

        await Task.WhenAll(tasks);

        // Assert
        unexpectedExceptions.Should().BeEmpty("there should be no unhandled 500 exceptions");
        successHolds.Count.Should().Be(totalSeats, "exactly the number of available seats must be allocated");
        conflictFailures.Count.Should().Be(concurrentRequests - totalSeats, "all excess concurrent requests must be rejected with Conflict (409)");

        // Verify Database State
        using (var verifyContext = new ApplicationDbContext(dbOptions))
        {
            var holdRepo = new HoldRepository(verifyContext);
            var now = DateTime.UtcNow;

            var heldCount = await holdRepo.GetActiveHoldCountAsync(classId, now);
            var confirmedCount = await holdRepo.GetConfirmedCountAsync(classId);

            (heldCount + confirmedCount).Should().Be(totalSeats);
            (heldCount + confirmedCount).Should().BeLessThanOrEqualTo(totalSeats, "Held + Confirmed must NEVER exceed TotalSeats (No Overselling Rule)");
        }
    }
}
