using System.Text.Json;
using BabyBlue.Contracts.Auth;
using BabyBlue.Data;

namespace BabyBlue.Api.Middleware;

public sealed class CallerContextMiddleware(RequestDelegate next)
{
    public async Task InvokeAsync(HttpContext ctx, ICallerAccessor callerAccessor)
    {
        var brand = ctx.GetResolvedBrand()
            ?? throw new InvalidOperationException("BrandResolutionMiddleware must run before CallerContextMiddleware.");

        CallerContext caller;
        if (ctx.User.Identity?.IsAuthenticated == true)
        {
            var rawSub = ctx.User.FindFirst("sub")?.Value;
            if (!Guid.TryParse(rawSub, out var uid) || uid == Guid.Empty)
            {
                ctx.Items["error_code"] = "not_authenticated";
                await Results.Problem(
                    type: "https://babyblue.co.za/errors/not_authenticated",
                    title: "not_authenticated",
                    statusCode: StatusCodes.Status401Unauthorized,
                    extensions: new Dictionary<string, object?>
                    {
                        ["code"] = "not_authenticated",
                        ["request_id"] = ctx.TraceIdentifier,
                    }).ExecuteAsync(ctx);
                return;
            }

            // Ignore the JWT's `role` claim when deciding DbRole: a leaked `service_role`
            // token still runs as `authenticated` in PostgreSQL.
            var email = ctx.User.FindFirst("email")?.Value;
            var expRaw = ctx.User.FindFirst("exp")?.Value;
            long? exp = long.TryParse(expRaw, out var parsedExp) ? parsedExp : null;

            var claimsPayload = new Dictionary<string, object?>
            {
                ["sub"] = uid.ToString(),
                ["role"] = "authenticated",
            };
            if (!string.IsNullOrEmpty(email))
            {
                claimsPayload["email"] = email;
            }
            if (exp.HasValue)
            {
                claimsPayload["exp"] = exp.Value;
            }

            var claimsJson = JsonSerializer.Serialize(claimsPayload);
            caller = new CallerContext(
                UserId: uid,
                DbRole: DbRole.Authenticated,
                ClaimsJson: claimsJson,
                Brand: brand,
                RequestId: ctx.TraceIdentifier);
        }
        else
        {
            caller = new CallerContext(
                UserId: null,
                DbRole: DbRole.Anonymous,
                ClaimsJson: "{}",
                Brand: brand,
                RequestId: ctx.TraceIdentifier);
        }

        callerAccessor.Initialize(caller);
        await next(ctx);
    }
}
