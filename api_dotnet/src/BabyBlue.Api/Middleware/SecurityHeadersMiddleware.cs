namespace BabyBlue.Api.Middleware;

public sealed class SecurityHeadersMiddleware(RequestDelegate next)
{
    public async Task InvokeAsync(HttpContext ctx)
    {
        ApplyHeaders(ctx);
        ctx.Response.OnStarting(() =>
        {
            ApplyHeaders(ctx);
            return Task.CompletedTask;
        });

        await next(ctx);
    }

    public static void ApplyHeaders(HttpContext ctx)
    {
        var headers = ctx.Response.Headers;
        headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains; preload";
        headers["X-Content-Type-Options"] = "nosniff";
        headers["Referrer-Policy"] = "no-referrer";
        headers["Cross-Origin-Resource-Policy"] = "same-site";

        if (!headers.ContainsKey("Cache-Control"))
        {
            headers["Cache-Control"] = "no-store";
        }

        headers.Remove("Server");
        headers.Remove("X-Powered-By");
    }
}
