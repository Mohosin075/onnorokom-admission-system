using SchoolAdmission.Application.DTOs;
using SchoolAdmission.Application.Interfaces;
using SchoolAdmission.Domain.Entities;
using SchoolAdmission.Domain.Exceptions;
using SchoolAdmission.Domain.Repositories;

namespace SchoolAdmission.Application.Services;

public class ClassService : IClassService
{
    private readonly IClassRepository _classRepository;
    private readonly IHoldRepository _holdRepository;
    private readonly IUnitOfWork _unitOfWork;

    public ClassService(
        IClassRepository classRepository,
        IHoldRepository holdRepository,
        IUnitOfWork unitOfWork)
    {
        _classRepository = classRepository;
        _holdRepository = holdRepository;
        _unitOfWork = unitOfWork;
    }

    public async Task<CreateClassResponse> CreateClassAsync(CreateClassRequest request, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
            throw new ValidationException("Class name is required.");

        if (request.TotalSeats <= 0)
            throw new ValidationException("Total seats must be greater than zero.");

        var classId = $"c_{Guid.NewGuid():N}";
        var newClass = new ClassRoom(classId, request.Name, request.TotalSeats);

        await _classRepository.AddAsync(newClass, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return new CreateClassResponse(newClass.Id, newClass.Name, newClass.TotalSeats);
    }

    public async Task<List<ClassResponse>> GetAllClassesAsync(CancellationToken cancellationToken = default)
    {
        var classes = await _classRepository.GetAllAsync(cancellationToken);
        var now = DateTime.UtcNow;
        var countsMap = await _holdRepository.GetSeatCountsForClassesAsync(now, cancellationToken);

        var result = new List<ClassResponse>(classes.Count);
        foreach (var cls in classes)
        {
            var (held, confirmed) = countsMap.TryGetValue(cls.Id, out var counts) ? counts : (0, 0);
            var available = Math.Max(0, cls.TotalSeats - (held + confirmed));

            result.Add(new ClassResponse(
                cls.Id,
                cls.Name,
                cls.TotalSeats,
                held,
                confirmed,
                available
            ));
        }

        return result;
    }

    public async Task<ClassResponse> GetClassByIdAsync(string classId, CancellationToken cancellationToken = default)
    {
        var cls = await _classRepository.GetByIdAsync(classId, cancellationToken);
        if (cls == null)
            throw new EntityNotFoundException("Class", classId);

        var now = DateTime.UtcNow;
        var counts = await _holdRepository.GetSeatCountsForClassesAsync(now, cancellationToken);
        var (held, confirmed) = counts.GetValueOrDefault(cls.Id);
        var available = Math.Max(0, cls.TotalSeats - (held + confirmed));

        return new ClassResponse(
            cls.Id,
            cls.Name,
            cls.TotalSeats,
            held,
            confirmed,
            available
        );
    }
}

