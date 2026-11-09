using System.Text.Json.Serialization;

namespace SchoolAdmission.Application.DTOs;

public record CreateClassRequest(
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("totalSeats")] int TotalSeats
);

public record CreateClassResponse(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("totalSeats")] int TotalSeats
);

public record ClassResponse(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("totalSeats")] int TotalSeats,
    [property: JsonPropertyName("heldSeats")] int HeldSeats,
    [property: JsonPropertyName("confirmedSeats")] int ConfirmedSeats,
    [property: JsonPropertyName("availableSeats")] int AvailableSeats
);

