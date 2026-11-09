using Microsoft.AspNetCore.Mvc;
using SchoolAdmission.Application.DTOs;
using SchoolAdmission.Application.Interfaces;
using SchoolAdmission.Domain.Exceptions;

namespace SchoolAdmission.Api.Controllers;

[ApiController]
[Route("me")]
public class MeController : ControllerBase
{
    private readonly IHoldService _holdService;

    public MeController(IHoldService holdService)
    {
        _holdService = holdService;
    }

    /// <summary>
    /// Get all applications of the student identified by X-Student-Id.
    /// </summary>
    [HttpGet("holds")]
    public async Task<ActionResult<List<StudentHoldResponse>>> GetMyHolds(
        [FromHeader(Name = "X-Student-Id")] string? studentId,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(studentId))
            throw new ValidationException("Header 'X-Student-Id' is required.");

        var result = await _holdService.GetStudentHoldsAsync(studentId, cancellationToken);
        return Ok(result);
    }
}
