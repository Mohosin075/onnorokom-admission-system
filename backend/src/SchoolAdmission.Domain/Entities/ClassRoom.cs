using SchoolAdmission.Domain.Exceptions;

namespace SchoolAdmission.Domain.Entities;

public class ClassRoom
{
    public string Id { get; private set; } = string.Empty;
    public string Name { get; private set; } = string.Empty;
    public int TotalSeats { get; private set; }
    public DateTime CreatedAtUtc { get; private set; }

    public ICollection<SeatHold> Holds { get; private set; } = new List<SeatHold>();

    private ClassRoom() { }

    public ClassRoom(string id, string name, int totalSeats)
    {
        if (string.IsNullOrWhiteSpace(id))
            throw new ValidationException("Class id cannot be empty.");

        if (string.IsNullOrWhiteSpace(name))
            throw new ValidationException("Class name is required.");

        if (totalSeats <= 0)
            throw new ValidationException("Total seats must be greater than zero.");

        Id = id;
        Name = name.Trim();
        TotalSeats = totalSeats;
        CreatedAtUtc = DateTime.UtcNow;
    }
}

