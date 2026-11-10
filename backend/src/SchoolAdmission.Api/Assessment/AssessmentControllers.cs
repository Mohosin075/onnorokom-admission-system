using Microsoft.AspNetCore.Mvc;
using SchoolAdmission.Application.DTOs;
using SchoolAdmission.Application.Interfaces;
using SchoolAdmission.Domain.Exceptions;

namespace SchoolAdmission.Api.Assessment;

internal static class AssessmentIdentity
{
    public static string Required(string? value) => !string.IsNullOrWhiteSpace(value)
        ? value : throw new ValidationException("Header 'X-Student-Id' is required and must contain a 17-digit birth registration number.");
}

[ApiController, Route("classes")]
public class AssessmentClassesController(IClassService classes, IHoldService holds) : ControllerBase
{
    [HttpPost]
    public async Task<ActionResult<CreateClassResponse>> Create(CreateClassRequest request, CancellationToken ct) =>
        StatusCode(201, await classes.CreateClassAsync(request, ct));

    [HttpGet]
    public async Task<ActionResult<List<ClassResponse>>> List(CancellationToken ct) => Ok(await classes.GetAllClassesAsync(ct));

    [HttpGet("{classId}")]
    public async Task<ActionResult<ClassResponse>> Detail(string classId, CancellationToken ct) => Ok(await classes.GetClassByIdAsync(classId, ct));

    [HttpPost("{classId}/holds")]
    public async Task<ActionResult<CreateHoldResponse>> Apply(string classId,
        [FromHeader(Name = "X-Student-Id")] string? studentId, CancellationToken ct) =>
        StatusCode(201, await holds.CreateHoldAsync(classId, AssessmentIdentity.Required(studentId), ct));
}

[ApiController, Route("holds")]
public class AssessmentHoldsController(IHoldService holds) : ControllerBase
{
    [HttpGet("{holdId}")]
    public async Task<ActionResult<HoldStatusResponse>> Status(string holdId, CancellationToken ct) => Ok(await holds.GetHoldByIdAsync(holdId, ct));

    [HttpPost("{holdId}/confirm")]
    public async Task<ActionResult<ConfirmHoldResponse>> Confirm(string holdId,
        [FromHeader(Name = "X-Student-Id")] string? studentId, CancellationToken ct) =>
        Ok(await holds.ConfirmHoldAsync(holdId, AssessmentIdentity.Required(studentId), ct));

    [HttpDelete("{holdId}")]
    public async Task<IActionResult> Cancel(string holdId, [FromHeader(Name = "X-Student-Id")] string? studentId, CancellationToken ct)
    {
        await holds.CancelHoldAsync(holdId, AssessmentIdentity.Required(studentId), ct);
        return NoContent();
    }
}

[ApiController, Route("me")]
public class AssessmentMeController(IHoldService holds) : ControllerBase
{
    [HttpGet("holds")]
    public async Task<ActionResult<List<StudentHoldResponse>>> History(
        [FromHeader(Name = "X-Student-Id")] string? studentId, CancellationToken ct) =>
        Ok(await holds.GetStudentHoldsAsync(AssessmentIdentity.Required(studentId), ct));
}
