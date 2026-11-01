using BabyBlue.Api.Middleware;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace BabyBlue.Api.Filters;

[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method, AllowMultiple = true)]
public sealed class RequireBrandFeatureAttribute(params string[] anyOfFeatures) : ActionFilterAttribute
{
    /// <summary>
    /// What to assume when a brand's <c>features</c> document says nothing about the feature.
    ///
    /// <c>true</c> for the modules every brand has (directory, booking, flow): an existing brand
    /// whose document predates a key should not lose a module it was already using.
    ///
    /// <c>false</c> for a licensed add-on such as Growth. §14 requires that a brand which has not
    /// licensed Growth gets <c>404</c> — "a brand without Growth should not learn that Growth
    /// exists" — and that is only true if silence means off. Defaulting an add-on to on would
    /// hand it to every brand created before the key existed.
    /// </summary>
    public bool DefaultEnabled { get; init; } = true;

    public override void OnActionExecuting(ActionExecutingContext context)
    {
        var brand = context.HttpContext.GetResolvedBrand();
        if (brand is null)
        {
            base.OnActionExecuting(context);
            return;
        }

        var enabled = anyOfFeatures.Length == 0 ||
                      anyOfFeatures.Any(f => brand.IsFeatureEnabled(f, DefaultEnabled));

        if (!enabled)
        {
            context.HttpContext.Items["error_code"] = "not_found";
            var problem = new ProblemDetails
            {
                Type = "https://babyblue.co.za/errors/not_found",
                Title = "not_found",
                Status = StatusCodes.Status404NotFound,
            };
            problem.Extensions["code"] = "not_found";
            problem.Extensions["request_id"] = context.HttpContext.TraceIdentifier;

            context.Result = new ObjectResult(problem)
            {
                StatusCode = StatusCodes.Status404NotFound,
            };
            return;
        }

        base.OnActionExecuting(context);
    }
}
