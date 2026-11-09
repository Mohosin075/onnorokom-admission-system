using System.Text.Json.Serialization;

namespace SchoolAdmission.Application.DTOs;

public record CreateHoldResponse(
    [property: JsonPropertyName("holdId")] string HoldId,
    [property: JsonPropertyName("classId")] string ClassId,
    [property: JsonPropertyName("studentId")] string StudentId,
    [property: JsonPropertyName("status")] string Status,
    [property: JsonPropertyName("expiresAt")] DateTime ExpiresAt
);

public record HoldStatusResponse(
    [property: JsonPropertyName("holdId")] string HoldId,
    [property: JsonPropertyName("classId")] string ClassId,
    [property: JsonPropertyName("status")] string Status,
    [property: JsonPropertyName("expiresAt")] DateTime ExpiresAt
);

public record ConfirmHoldResponse(
    [property: JsonPropertyName("holdId")] string HoldId,
    [property: JsonPropertyName("status")] string Status
);

public record StudentHoldResponse(
    [property: JsonPropertyName("holdId")] string HoldId,
    [property: JsonPropertyName("classId")] string ClassId,
    [property: JsonPropertyName("className")] string ClassName,
    [property: JsonPropertyName("status")] string Status,
    [property: JsonPropertyName("expiresAt")] DateTime ExpiresAt
);
