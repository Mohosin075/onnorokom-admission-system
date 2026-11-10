using Microsoft.AspNetCore.Mvc;
using SchoolAdmission.Application.DTOs;
using SchoolAdmission.Application.Interfaces;
using SchoolAdmission.Domain.Exceptions;
using Microsoft.AspNetCore.Authorization;
using SchoolAdmission.Api.Portal;

namespace SchoolAdmission.Api.Controllers;

[ApiController, Authorize]
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
        CancellationToken cancellationToken)
    {
        var studentId = User.StudentId();
        if (string.IsNullOrEmpty(studentId)) return Ok(new List<StudentHoldResponse>());
        var result = await _holdService.GetStudentHoldsAsync(studentId, cancellationToken);
        return Ok(result);
    }
}

