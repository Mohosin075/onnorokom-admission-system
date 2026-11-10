using Microsoft.AspNetCore.Mvc;
using SchoolAdmission.Application.DTOs;
using SchoolAdmission.Application.Interfaces;
using SchoolAdmission.Domain.Exceptions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using SchoolAdmission.Api.Portal;
using SchoolAdmission.Infrastructure.Persistence;

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
    [Authorize(Roles = "Admin"), HttpPost]
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
    [Authorize(Roles = "Student"), HttpPost("{classId}/holds")]
    public async Task<ActionResult<CreateHoldResponse>> CreateHold(
        [FromRoute] string classId,
        [FromServices] ApplicationDbContext db,
        CancellationToken cancellationToken)
    {
        var studentId = User.StudentId();
        var user = await PortalSecurity.Current(db, User, cancellationToken);
        if (string.IsNullOrWhiteSpace(studentId) || string.IsNullOrWhiteSpace(user.FullName) || user.DateOfBirth == null)
            throw new ValidationException("Complete your admission profile before reserving a seat.");
        if (!await db.Documents.AnyAsync(x => x.UserId == user.Id && x.Kind == "BirthCertificate" && x.ReviewStatus == "Approved", cancellationToken)
            || !await db.Documents.AnyAsync(x => x.UserId == user.Id && x.Kind == "Photograph" && x.ReviewStatus == "Approved", cancellationToken))
            throw new ValidationException("Upload your birth certificate and photograph, and wait for admissions to approve them before applying.");
        if (!await db.Fees.AnyAsync(x => x.ClassId == classId && x.Amount >= 10, cancellationToken))
            throw new ValidationException("Admissions are not open for this class yet.");
        var result = await _holdService.CreateHoldAsync(classId, studentId, cancellationToken);
        return StatusCode(StatusCodes.Status201Created, result);
    }
}

