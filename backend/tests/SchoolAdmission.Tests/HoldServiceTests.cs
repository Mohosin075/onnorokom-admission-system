using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using SchoolAdmission.Application.Common;
using SchoolAdmission.Application.Services;
using SchoolAdmission.Domain.Entities;
using SchoolAdmission.Domain.Enums;
using SchoolAdmission.Domain.Exceptions;
using SchoolAdmission.Infrastructure.Persistence;
using SchoolAdmission.Infrastructure.Persistence.Repositories;
using Xunit;

namespace SchoolAdmission.Tests;

public class HoldServiceTests
{
    private ApplicationDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: $"HoldServiceDb_{Guid.NewGuid():N}")
            .Options;
        return new ApplicationDbContext(options);
    }

    [Fact]
    public async Task ConfirmHold_MultipleTimes_IsIdempotentAndReturnsConfirmedStatus()
    {
        using var context = CreateContext();
        var classRepo = new ClassRepository(context);
        var holdRepo = new HoldRepository(context);
        var unitOfWork = new UnitOfWork(context);
        var options = Options.Create(new HoldOptions { HoldDurationSeconds = 600 });
        var service = new HoldService(classRepo, holdRepo, unitOfWork, options);

        var cls = new ClassRoom("c_idem", "Class 8", 20);
        await context.Classes.AddAsync(cls);
        await context.SaveChangesAsync();

        var studentId = "20261111222233334";
        var holdRes = await service.CreateHoldAsync(cls.Id, studentId);

        // First confirmation
        var confirm1 = await service.ConfirmHoldAsync(holdRes.HoldId, studentId);
        confirm1.Status.Should().Be("CONFIRMED");

        // Second confirmation (Idempotent call)
        var confirm2 = await service.ConfirmHoldAsync(holdRes.HoldId, studentId);
        confirm2.Status.Should().Be("CONFIRMED");

        // Confirmed seats should still only be 1
        var confirmedCount = await holdRepo.GetConfirmedCountAsync(cls.Id);
        confirmedCount.Should().Be(1);
    }

    [Fact]
    public async Task CreateHold_WhenStudentAlreadyHasActiveHoldInSameClass_ThrowsConflict()
    {
        using var context = CreateContext();
        var classRepo = new ClassRepository(context);
        var holdRepo = new HoldRepository(context);
        var unitOfWork = new UnitOfWork(context);
        var options = Options.Create(new HoldOptions { HoldDurationSeconds = 600 });
        var service = new HoldService(classRepo, holdRepo, unitOfWork, options);

        var cls = new ClassRoom("c_single", "Class 9", 20);
        await context.Classes.AddAsync(cls);
        await context.SaveChangesAsync();

        var studentId = "20269999888877776";
        await service.CreateHoldAsync(cls.Id, studentId);

        // Attempt second hold in same class
        var act = async () => await service.CreateHoldAsync(cls.Id, studentId);

        await act.Should().ThrowAsync<ConflictException>()
            .WithMessage("*already has an active hold*");
    }

    [Fact]
    public async Task ConfirmHold_WhenExpired_ThrowsConflict()
    {
        using var context = CreateContext();
        var classRepo = new ClassRepository(context);
        var holdRepo = new HoldRepository(context);
        var unitOfWork = new UnitOfWork(context);
        // Expired hold (1 second duration)
        var options = Options.Create(new HoldOptions { HoldDurationSeconds = 1 });
        var service = new HoldService(classRepo, holdRepo, unitOfWork, options);

        var cls = new ClassRoom("c_exp", "Class 10", 20);
        await context.Classes.AddAsync(cls);
        await context.SaveChangesAsync();

        var studentId = "20265555444433332";
        var holdRes = await service.CreateHoldAsync(cls.Id, studentId);

        // Wait for expiry
        await Task.Delay(1100);

        var act = async () => await service.ConfirmHoldAsync(holdRes.HoldId, studentId);

        await act.Should().ThrowAsync<ConflictException>()
            .WithMessage("*expired*");
    }
}

