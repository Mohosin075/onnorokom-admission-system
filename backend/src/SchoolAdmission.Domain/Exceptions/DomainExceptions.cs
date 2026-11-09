namespace SchoolAdmission.Domain.Exceptions;

public abstract class DomainException : Exception
{
    protected DomainException(string message) : base(message)
    {
    }
}

public class EntityNotFoundException : DomainException
{
    public EntityNotFoundException(string entityName, object key)
        : base($"{entityName} with id '{key}' was not found.")
    {
    }

    public EntityNotFoundException(string message) : base(message)
    {
    }
}

public class ConflictException : DomainException
{
    public ConflictException(string message) : base(message)
    {
    }
}

public class ValidationException : DomainException
{
    public ValidationException(string message) : base(message)
    {
    }
}

