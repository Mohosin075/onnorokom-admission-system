using FluentAssertions;
using SchoolAdmission.Api.Portal;
using SchoolAdmission.Domain.Exceptions;

namespace SchoolAdmission.Tests;

public class PasswordPolicyTests
{
    [Theory]
    [InlineData("Abc123", true)]
    [InlineData("Abcd1234", true)]
    [InlineData("Abcde1234", false)]
    [InlineData("Abc12", false)]
    [InlineData("abcdefgh", false)]
    [InlineData("12345678", false)]
    public void NewPasswordsEnforceSixToEightCharactersWithLettersAndNumbers(string password, bool valid)
    {
        Action validate = () => PortalSecurity.Password(password);
        if (valid) validate.Should().NotThrow();
        else validate.Should().Throw<ValidationException>();
    }
}
