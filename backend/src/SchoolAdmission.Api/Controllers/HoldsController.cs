using Microsoft.AspNetCore.Mvc;
using SchoolAdmission.Application.DTOs;
using SchoolAdmission.Application.Interfaces;
using SchoolAdmission.Domain.Exceptions;

namespace SchoolAdmission.Api.Controllers;

[ApiController]
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
        CancellationToken cancellationToken)
    {
        var result = await _holdService.GetHoldByIdAsync(holdId, cancellationToken);
        return Ok(result);
    }

    /// <summary>
    /// Confirm admission fee payment for a held seat.
    /// </summary>
    [HttpPost("{holdId}/confirm")]
    public async Task<ActionResult<ConfirmHoldResponse>> ConfirmHold(
        [FromRoute] string holdId,
        [FromHeader(Name = "X-Student-Id")] string? studentId,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(studentId))
            throw new ValidationException("Header 'X-Student-Id' is required.");

        var result = await _holdService.ConfirmHoldAsync(holdId, studentId, cancellationToken);
        return Ok(result);
    }

    /// <summary>
    /// Cancel a hold application and release the seat.
    /// </summary>
    [HttpDelete("{holdId}")]
    public async Task<IActionResult> CancelHold(
        [FromRoute] string holdId,
        [FromHeader(Name = "X-Student-Id")] string? studentId,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(studentId))
            throw new ValidationException("Header 'X-Student-Id' is required.");

        await _holdService.CancelHoldAsync(holdId, studentId, cancellationToken);
        return NoContent();
    }
}

