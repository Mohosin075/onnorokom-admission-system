using Microsoft.OpenApi.Models;
using Swashbuckle.AspNetCore.SwaggerGen;

namespace SchoolAdmission.Api.Filters;

public class StudentIdHeaderOperationFilter : IOperationFilter
{
    public void Apply(OpenApiOperation operation, OperationFilterContext context)
    {
        operation.Parameters ??= new List<OpenApiParameter>();

        var path = context.ApiDescription.RelativePath?.ToLowerInvariant() ?? string.Empty;
        var method = context.ApiDescription.HttpMethod?.ToUpperInvariant() ?? string.Empty;

        // Paths requiring X-Student-Id
        var requiresStudentId =
            (path.Contains("holds") && method is "POST" or "DELETE" && !path.EndsWith("classes")) ||
            path.Contains("me/holds");

        if (requiresStudentId)
        {
            var existing = operation.Parameters.FirstOrDefault(x => x.Name == "X-Student-Id" && x.In == ParameterLocation.Header);
            if (existing != null) { existing.Required = true; return; }
            operation.Parameters.Add(new OpenApiParameter
            {
                Name = "X-Student-Id",
                In = ParameterLocation.Header,
                Required = true,
                Description = "Student 17-digit birth registration number (e.g. 20152691234567890)",
                Schema = new OpenApiSchema
                {
                    Type = "string",
                    Example = new Microsoft.OpenApi.Any.OpenApiString("20152691234567890")
                }
            });
        }
    }
}

