using Microsoft.AspNetCore.Mvc;
using SchoolAdmission.Application.DTOs;
using SchoolAdmission.Application.Interfaces;
using SchoolAdmission.Domain.Exceptions;

namespace SchoolAdmission.Api.Controllers;

[ApiController]
[Route("classes")]
public class ClassesController : ControllerBase
{
    private readonly IClassService _classService;
    private readonly IHoldService _holdService;

    public ClassesController(IClassService classService, IHoldService holdService)
    {
        _classService = classService;
        _holdService = holdService;
    }

    /// <summary>
    /// Create a new class with seat capacity.
    /// </summary>
    [HttpPost]
    public async Task<ActionResult<CreateClassResponse>> CreateClass(
        [FromBody] CreateClassRequest request,
        CancellationToken cancellationToken)
    {
        var result = await _classService.CreateClassAsync(request, cancellationToken);
        return StatusCode(StatusCodes.Status201Created, result);
    }

    /// <summary>
    /// Get all classes with live seat counts (total, held, confirmed, available).
    /// </summary>
    [HttpGet]
    public async Task<ActionResult<List<ClassResponse>>> GetClasses(CancellationToken cancellationToken)
    {
        var result = await _classService.GetAllClassesAsync(cancellationToken);
        return Ok(result);
    }

    /// <summary>
    /// Get details of a specific class with live seat counts.
    /// </summary>
    [HttpGet("{classId}")]
    public async Task<ActionResult<ClassResponse>> GetClassById(
        [FromRoute] string classId,
        CancellationToken cancellationToken)
    {
        var result = await _classService.GetClassByIdAsync(classId, cancellationToken);
        return Ok(result);
    }

    /// <summary>
    /// Hold/reserve a seat in a class.
    /// </summary>
    [HttpPost("{classId}/holds")]
    public async Task<ActionResult<CreateHoldResponse>> CreateHold(
        [FromRoute] string classId,
        [FromHeader(Name = "X-Student-Id")] string? studentId,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(studentId))
            throw new ValidationException("Header 'X-Student-Id' is required.");

        var result = await _holdService.CreateHoldAsync(classId, studentId, cancellationToken);
        return StatusCode(StatusCodes.Status201Created, result);
    }
}

