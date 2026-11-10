using Microsoft.AspNetCore.Mvc.ApplicationParts;
using Microsoft.AspNetCore.Mvc.Controllers;

namespace SchoolAdmission.Api.Assessment;

// Keep no-login assessment routes out of the authenticated portal, and portal routes out of assessment mode.
public sealed class ModeControllerFeatureProvider(bool assessment) : IApplicationFeatureProvider<ControllerFeature>
{
    public void PopulateFeature(IEnumerable<ApplicationPart> parts, ControllerFeature feature)
    {
        foreach (var type in feature.Controllers.ToArray())
        {
            var belongsToAssessment = type.Namespace == typeof(AssessmentClassesController).Namespace;
            if (belongsToAssessment != assessment) feature.Controllers.Remove(type);
        }
    }
}
