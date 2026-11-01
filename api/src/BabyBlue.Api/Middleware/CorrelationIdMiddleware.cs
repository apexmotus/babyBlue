using System.Text.RegularExpressions;

namespace BabyBlue.Api.Middleware;

public sealed partial class CorrelationIdMiddleware(RequestDelegate next)
{
    public const string HeaderName = "X-Request-Id";

    [GeneratedRegex("^[a-zA-Z0-9_-]{1,64}$", RegexOptions.CultureInvariant)]
    private static partial Regex ValidRequestIdRegex();

    public Task InvokeAsync(HttpContext ctx)
    {
        var incoming = ctx.Request.Headers[HeaderName].ToString();
        var requestId = !string.IsNullOrEmpty(incoming) && ValidRequestIdRegex().IsMatch(incoming)
            ? incoming
            : Guid.NewGuid().ToString("n");

        ctx.TraceIdentifier = requestId;
        ctx.Response.Headers[HeaderName] = requestId;
        ctx.Response.OnStarting(() =>
        {
            ctx.Response.Headers[HeaderName] = requestId;
            return Task.CompletedTask;
        });

        return next(ctx);
    }
}
