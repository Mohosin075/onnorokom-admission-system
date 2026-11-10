using Microsoft.AspNetCore.Mvc;
using SchoolAdmission.Application.DTOs;
using SchoolAdmission.Application.Interfaces;
using SchoolAdmission.Domain.Exceptions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using SchoolAdmission.Api.Portal;
using SchoolAdmission.Infrastructure.Persistence;

namespace SchoolAdmission.Api.Controllers;

[ApiController, Authorize]
[Route("holds")]
public class HoldsController : ControllerBase
{
    private readonly IHoldService _holdService;

    public HoldsController(IHoldService holdService)
    {
        _holdService = holdService;
    }

    /// <summary>
    /// Check current status of an application hold.
    /// </summary>
    [HttpGet("{holdId}")]
    public async Task<ActionResult<HoldStatusResponse>> GetHoldById(
        [FromRoute] string holdId,
        [FromServices] ApplicationDbContext db,
        CancellationToken cancellationToken)
    {
        if (!await db.Holds.AnyAsync(x => x.Id == holdId && (x.StudentId == User.StudentId() || User.IsInRole("Admin")), cancellationToken))
            return NotFound();
        var result = await _holdService.GetHoldByIdAsync(holdId, cancellationToken);
        return Ok(result);
    }

    /// <summary>
    /// Confirm admission fee payment for a held seat.
    /// </summary>
    [HttpPost("{holdId}/confirm")]
    public async Task<ActionResult<ConfirmHoldResponse>> ConfirmHold(
        [FromRoute] string holdId,
        CancellationToken cancellationToken)
    {
        await Task.CompletedTask;
        return StatusCode(410, new { message = "Direct confirmation is disabled. Admission is confirmed only after a verified Stripe payment." });
    }

    /// <summary>
    /// Cancel a hold application and release the seat.
    /// </summary>
    [HttpDelete("{holdId}")]
    public async Task<IActionResult> CancelHold(
        [FromRoute] string holdId,
        [FromServices] ApplicationDbContext db,
        CancellationToken cancellationToken)
    {
        var studentId = User.StudentId();
        if (await db.Payments.AnyAsync(x => x.HoldId == holdId && x.Status == "Pending" && x.ValidationId != null, cancellationToken))
            return Conflict(new { message = "A Stripe checkout is in progress. Wait for it to complete or for the reservation to expire." });
        await _holdService.CancelHoldAsync(holdId, studentId, cancellationToken);
        return NoContent();
    }
}

