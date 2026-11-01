using BabyBlue.Api.Network;
using BabyBlue.Data;
using Microsoft.Extensions.Options;

namespace BabyBlue.Api.Middleware;

public sealed class BrandResolutionMiddleware(
    RequestDelegate next,
    IBrandRegistry registry,
    IOptions<NetworkOptions> network,
    ILogger<BrandResolutionMiddleware> log)
{
    public const string TenantHostHeader = "X-Tenant-Host";

    public async Task InvokeAsync(HttpContext ctx)
    {
        var host = ResolveEffectiveHost(ctx, network.Value);
        var brand = string.IsNullOrEmpty(host)
            ? null
            : await registry.ResolveAsync(host, ctx.RequestAborted);

        if (brand is null)
        {
            log.LogWarning("brand_unresolved host={Host} request_id={RequestId}", host, ctx.TraceIdentifier);
            ctx.Items["error_code"] = "brand_not_found";
            await Results.Problem(
                type: "https://babyblue.co.za/errors/brand_not_found",
                title: "brand_not_found",
                statusCode: StatusCodes.Status404NotFound,
                extensions: new Dictionary<string, object?>
                {
                    ["code"] = "brand_not_found",
                    ["request_id"] = ctx.TraceIdentifier,
                }).ExecuteAsync(ctx);
            return;
        }

        if (brand.Status is "suspended" or "archived")
        {
            ctx.Items["error_code"] = "brand_unavailable";
            await Results.Problem(
                type: "https://babyblue.co.za/errors/brand_unavailable",
                title: "brand_unavailable",
                statusCode: StatusCodes.Status403Forbidden,
                extensions: new Dictionary<string, object?>
                {
                    ["code"] = "brand_unavailable",
                    ["request_id"] = ctx.TraceIdentifier,
                }).ExecuteAsync(ctx);
            return;
        }

        ctx.Items[BrandKeys.Resolved] = brand;
        await next(ctx);
    }

    /// <summary>
    /// The host the brand is resolved from.
    ///
    /// <c>X-Tenant-Host</c> and <c>Origin</c> are both caller-supplied, so they are consulted
    /// only when the request actually arrived at a shared platform API host — the F-07 case
    /// where <c>Request.Host</c> cannot identify the brand because every brand shares it. A
    /// request that arrives at a per-brand host already names its brand, and letting a header
    /// override it would hand the caller brand selection for no benefit.
    ///
    /// This is not a privilege boundary: RLS inside each brand schema evaluates
    /// <c>auth.uid()</c>, so a crossed brand still shows the caller only their own rows. It is
    /// the difference between the brand being determined by where the request landed and being
    /// determined by what the request asked for.
    /// </summary>
    public static string ResolveEffectiveHost(HttpContext ctx, NetworkOptions? network = null)
    {
        var requestHost = ctx.Request.Host.Host.Trim().ToLowerInvariant();

        network ??= ctx.RequestServices?.GetService<IOptions<NetworkOptions>>()?.Value;
        if (!IsPlatformApiHost(requestHost, network))
        {
            return requestHost;
        }

        if (ctx.Request.Headers.TryGetValue(TenantHostHeader, out var tenantValues))
        {
            var rawTenantHost = tenantValues.ToString().Trim();
            if (!string.IsNullOrEmpty(rawTenantHost))
            {
                var parsedHost = new HostString(rawTenantHost).Host.Trim().ToLowerInvariant();
                if (!string.IsNullOrEmpty(parsedHost) &&
                    Uri.CheckHostName(parsedHost) != UriHostNameType.Unknown)
                {
                    return parsedHost;
                }

                // Syntactically invalid X-Tenant-Host must not fall back to Request.Host
                return string.Empty;
            }
        }

        if (ctx.Request.Headers.TryGetValue("Origin", out var originValues) &&
            Uri.TryCreate(originValues.ToString(), UriKind.Absolute, out var originUri) &&
            !string.IsNullOrEmpty(originUri.Host))
        {
            return originUri.Host.ToLowerInvariant();
        }

        return requestHost;
    }

    /// <summary>
    /// Whether this host is a shared API endpoint serving every brand, rather than one brand's
    /// own domain. Configured through <c>Network:PlatformApiHosts</c>; with nothing configured
    /// it falls back to the <c>api.</c> label convention, which is what the original code did.
    /// </summary>
    public static bool IsPlatformApiHost(string requestHost, NetworkOptions? network)
    {
        if (network is { PlatformApiHosts.Length: > 0 })
        {
            foreach (var candidate in network.PlatformApiHosts)
            {
                if (string.Equals(candidate.Trim(), requestHost, StringComparison.OrdinalIgnoreCase))
                {
                    return true;
                }
            }

            return false;
        }

        return requestHost.StartsWith("api.", StringComparison.Ordinal);
    }
}
