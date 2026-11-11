namespace SchoolAdmission.Domain.Repositories;

public sealed record ClassAdmissionState(int TotalSeats, int OccupiedSeats, bool HasActiveApplication);
