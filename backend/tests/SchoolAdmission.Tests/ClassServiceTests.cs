using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using SchoolAdmission.Application.DTOs;
using SchoolAdmission.Application.Services;
using SchoolAdmission.Domain.Entities;
using SchoolAdmission.Domain.Exceptions;
using SchoolAdmission.Infrastructure.Persistence;
using SchoolAdmission.Infrastructure.Persistence.Repositories;
using Xunit;

namespace SchoolAdmission.Tests;

public class ClassServiceTests
{
    private ApplicationDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: $"ClassServiceDb_{Guid.NewGuid():N}")
            .Options;
        return new ApplicationDbContext(options);
    }

    [Fact]
    public async Task CreateClass_WithValidData_ReturnsCreatedClass()
    {
        using var context = CreateContext();
        var classRepo = new ClassRepository(context);
        var holdRepo = new HoldRepository(context);
        var unitOfWork = new UnitOfWork(context);
        var service = new ClassService(classRepo, holdRepo, unitOfWork);

        var request = new CreateClassRequest("Class 6 - Morning Shift", 120);
        var result = await service.CreateClassAsync(request);

        result.Should().NotBeNull();
        result.Id.Should().StartWith("c_");
        result.Name.Should().Be("Class 6 - Morning Shift");
        result.TotalSeats.Should().Be(120);
    }

    [Fact]
    public async Task CreateClass_WithInvalidSeats_ThrowsValidationException()
    {
        using var context = CreateContext();
        var classRepo = new ClassRepository(context);
        var holdRepo = new HoldRepository(context);
        var unitOfWork = new UnitOfWork(context);
        var service = new ClassService(classRepo, holdRepo, unitOfWork);

        var request = new CreateClassRequest("Class 6 - Invalid", 0);
        var act = async () => await service.CreateClassAsync(request);

        await act.Should().ThrowAsync<ValidationException>()
            .WithMessage("*must be greater than zero*");
    }

    [Fact]
    public async Task GetAllClasses_CalculatesAvailableSeatsCorrectly()
    {
        using var context = CreateContext();
        var classRepo = new ClassRepository(context);
        var holdRepo = new HoldRepository(context);
        var unitOfWork = new UnitOfWork(context);
        var service = new ClassService(classRepo, holdRepo, unitOfWork);

        var cls = new ClassRoom("c_test", "Class 7 - Day Shift", 50);
        await context.Classes.AddAsync(cls);

        // Add 10 holds
        for (int i = 1; i <= 10; i++)
        {
            var hold = new SeatHold($"h_{i}", cls.Id, $"202600000000000{i:D2}", 600);
            await context.Holds.AddAsync(hold);
        }

        // Add 5 confirmed admissions
        for (int i = 11; i <= 15; i++)
        {
            var hold = new SeatHold($"h_{i}", cls.Id, $"202600000000000{i:D2}", 600);
            hold.Confirm($"202600000000000{i:D2}", DateTime.UtcNow);
            await context.Holds.AddAsync(hold);
        }

        await context.SaveChangesAsync();

        var classes = await service.GetAllClassesAsync();
        var target = classes.First(c => c.Id == "c_test");

        target.TotalSeats.Should().Be(50);
        target.HeldSeats.Should().Be(10);
        target.ConfirmedSeats.Should().Be(5);
        target.AvailableSeats.Should().Be(35); // 50 - (10 + 5)
    }
}
