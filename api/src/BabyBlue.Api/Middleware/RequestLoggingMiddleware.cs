using System.Diagnostics;
using System.Security.Cryptography;
using System.Text;
using BabyBlue.Api.Filters;
using BabyBlue.Data;

namespace BabyBlue.Api.Middleware;

public sealed class RequestLoggingMiddleware(
    RequestDelegate next,
    ILogger<RequestLoggingMiddleware> log,
    IConfiguration configuration)
{
    private readonly byte[] _userHashSalt = Encoding.UTF8.GetBytes(
        configuration["Observability:UserHashSalt"] ?? "babyblue-default-env-salt-change-in-prod");

    public async Task InvokeAsync(HttpContext ctx, ICallerAccessor callerAccessor)
    {
        var sw = Stopwatch.StartNew();
        try
        {
            await next(ctx);
        }
        finally
        {
            sw.Stop();

            if (!ShouldRedactAccessLog(ctx))
            {
                var routeTemplate = (ctx.GetEndpoint() as RouteEndpoint)?.RoutePattern.RawText ?? "unmatched";
                var proc = callerAccessor.LastProcedure ?? ctx.Items["procedure"]?.ToString() ?? "none";
                var brandSlug = ctx.GetResolvedBrand()?.Slug ?? "unresolved";
                var caller = callerAccessor.IsInitialized ? callerAccessor.Current : null;
                var dbRole = caller?.DbRole.ToString() ?? "none";
                var userHash = ComputeUserHash(caller?.UserId, _userHashSalt);
                var code = ctx.Items["error_code"]?.ToString();

                log.LogInformation(
                    "request method={Method} route={Route} procedure={Procedure} status={Status} " +
                    "duration_ms={Duration} brand={BrandSlug} role={DbRole} user_hash={UserHash} " +
                    "request_id={RequestId} code={Code}",
                    ctx.Request.Method,
                    routeTemplate,
                    proc,
                    ctx.Response.StatusCode,
                    sw.ElapsedMilliseconds,
                    brandSlug,
                    dbRole,
                    userHash,
                    ctx.TraceIdentifier,
                    code);
            }
        }
    }

    public static bool ShouldRedactAccessLog(HttpContext ctx) =>
        ctx.Items.ContainsKey(RedactAccessLogAttribute.HttpContextItemKey) ||
        ctx.Request.Path.StartsWithSegments("/v1/queue/tokens", StringComparison.OrdinalIgnoreCase);

    public static string ComputeUserHash(Guid? userId, byte[] salt)
    {
        if (userId is null)
        {
            return "anon";
        }

        Span<byte> input = stackalloc byte[16];
        userId.Value.TryWriteBytes(input);
        Span<byte> hash = stackalloc byte[32];
        HMACSHA256.HashData(salt, input, hash);
        return Convert.ToHexStringLower(hash[..8]);
    }
}
