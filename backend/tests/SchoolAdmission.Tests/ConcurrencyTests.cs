using FluentAssertions;
using Microsoft.Extensions.DependencyInjection;
using SchoolAdmission.Application.DTOs;
using SchoolAdmission.Application.Interfaces;
using SchoolAdmission.Domain.Exceptions;

namespace SchoolAdmission.Tests;

public class ConcurrencyTests(PostgresFixture database) : IClassFixture<PostgresFixture>
{
    [PostgresFact]
    public async Task ThirtyReservationsAcrossTwoHosts_AllocateOnlyFiveSeats()
    {
        using var a=database.CreateFactory();using var b=database.CreateFactory();
        using var scope=a.Services.CreateScope();
        var cls=await scope.ServiceProvider.GetRequiredService<IClassService>().CreateClassAsync(new CreateClassRequest("Isolated concurrency test",5));
        var results=await Task.WhenAll(Enumerable.Range(0,30).Select(async i=>{
            using var requestScope=(i%2==0?a:b).Services.CreateScope();
            try{await requestScope.ServiceProvider.GetRequiredService<IHoldService>().CreateHoldAsync(cls.Id,$"2026{i:0000000000000}");return true;}catch(ConflictException){return false;}
        }));
        results.Count(x=>x).Should().Be(5);
        var state=await scope.ServiceProvider.GetRequiredService<IClassService>().GetClassByIdAsync(cls.Id);
        state.AvailableSeats.Should().Be(0);state.HeldSeats.Should().Be(5);
    }

    [PostgresFact]
    public async Task ConcurrentConfirmationIsIdempotent_AndPersistsAcrossHosts()
    {
        using var a=database.CreateFactory();using var b=database.CreateFactory();using var scope=a.Services.CreateScope();
        var cls=await scope.ServiceProvider.GetRequiredService<IClassService>().CreateClassAsync(new CreateClassRequest("Isolated confirmation test",1));
        const string student="20260000000000099";
        var hold=await scope.ServiceProvider.GetRequiredService<IHoldService>().CreateHoldAsync(cls.Id,student);
        await Task.WhenAll(Enumerable.Range(0,30).Select(async i=>{using var s=(i%2==0?a:b).Services.CreateScope();await s.ServiceProvider.GetRequiredService<IHoldService>().ConfirmHoldAsync(hold.HoldId,student);}));
        using var reader=b.Services.CreateScope();
        var state=await reader.ServiceProvider.GetRequiredService<IClassService>().GetClassByIdAsync(cls.Id);
        state.ConfirmedSeats.Should().Be(1);state.HeldSeats.Should().Be(0);
    }
}
