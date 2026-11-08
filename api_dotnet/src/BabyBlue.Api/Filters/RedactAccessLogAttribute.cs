using Microsoft.AspNetCore.Mvc.Filters;

namespace BabyBlue.Api.Filters;

[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method)]
public sealed class RedactAccessLogAttribute : ActionFilterAttribute
{
    public const string HttpContextItemKey = "redact_access_log";

    public override void OnActionExecuting(ActionExecutingContext context)
    {
        context.HttpContext.Items[HttpContextItemKey] = true;
        base.OnActionExecuting(context);
    }
}
