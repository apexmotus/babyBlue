using System.Net;
using System.Net.Sockets;
using System.Threading.RateLimiting;
using BabyBlue.Api.Middleware;
using Microsoft.AspNetCore.RateLimiting;

namespace BabyBlue.Api.RateLimiting;

public static class Policies
{
    public const string DirectorySearch = "DirectorySearch";
    public const string QueueJoin = "QueueJoin";
    public const string PublicPerIp = "PublicPerIp";
    public const string AuthenticatedPerUser = "AuthenticatedPerUser";
    public const string SlotHold = "SlotHold";
    public const string PracticeCreate = "PracticeCreate";
    public const string ClientTypeahead = "ClientTypeahead";
}

public static class BabyBlueRateLimiterPolicies
{
    public static IServiceCollection AddBabyBlueRateLimiting(this IServiceCollection services)
    {
        services.AddRateLimiter(o =>
        {
            o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
            o.OnRejected = async (ctx, ct) =>
            {
                var retryAfterSeconds = ctx.Lease.TryGetMetadata(MetadataName.RetryAfter, out var after)
                    ? Math.Max(1, (int)Math.Ceiling(after.TotalSeconds))
                    : 60;

                var code = RejectionCodeFor(ctx.HttpContext);

                ctx.HttpContext.Response.Headers.RetryAfter = retryAfterSeconds.ToString();
                ctx.HttpContext.Items["error_code"] = code;
                SecurityHeadersMiddleware.ApplyHeaders(ctx.HttpContext);
                await ProblemDetailsExceptionHandler.ReapplyCorsHeadersAsync(ctx.HttpContext);

                await Results.Problem(
                    type: $"https://babyblue.co.za/errors/{code}",
                    title: code,
                    statusCode: StatusCodes.Status429TooManyRequests,
                    extensions: new Dictionary<string, object?>
                    {
                        ["code"] = code,
                        ["request_id"] = ctx.HttpContext.TraceIdentifier,
                    }).ExecuteAsync(ctx.HttpContext);
            };

            // Default for every authenticated route: 120 / min / brand+user
            o.AddPolicy(Policies.AuthenticatedPerUser, ctx => RateLimitPartition.GetTokenBucketLimiter(
                PartitionKey(ctx),
                _ => new TokenBucketRateLimiterOptions
                {
                    TokenLimit = 120,
                    TokensPerPeriod = 120,
                    ReplenishmentPeriod = TimeSpan.FromMinutes(1),
                    QueueLimit = 0,
                    AutoReplenishment = true,
                }));

            // IMPROVEMENT_PLAN §10: 10 holds / hour / user
            o.AddPolicy(Policies.SlotHold, ctx => RateLimitPartition.GetFixedWindowLimiter(
                PartitionKey(ctx),
                _ => new FixedWindowRateLimiterOptions
                {
                    PermitLimit = 10,
                    Window = TimeSpan.FromHours(1),
                    QueueLimit = 0,
                    AutoReplenishment = true,
                }));

            // IMPROVEMENT_PLAN §10: 3 practice creations / day / user
            o.AddPolicy(Policies.PracticeCreate, ctx => RateLimitPartition.GetFixedWindowLimiter(
                PartitionKey(ctx),
                _ => new FixedWindowRateLimiterOptions
                {
                    PermitLimit = 3,
                    Window = TimeSpan.FromDays(1),
                    QueueLimit = 0,
                    AutoReplenishment = true,
                }));

            // Phase 4: 30 client typeahead searches / min / user
            o.AddPolicy(Policies.ClientTypeahead, ctx => RateLimitPartition.GetFixedWindowLimiter(
                PartitionKey(ctx),
                _ => new FixedWindowRateLimiterOptions
                {
                    PermitLimit = 30,
                    Window = TimeSpan.FromMinutes(1),
                    QueueLimit = 0,
                    AutoReplenishment = true,
                }));

            // IMPROVEMENT_PLAN §10: 3 queue joins / hour / brand+IP
            o.AddPolicy(Policies.QueueJoin, ctx => RateLimitPartition.GetFixedWindowLimiter(
                IpPartitionKey(ctx),
                _ => new FixedWindowRateLimiterOptions
                {
                    PermitLimit = 3,
                    Window = TimeSpan.FromHours(1),
                    QueueLimit = 0,
                    AutoReplenishment = true,
                }));

            // IMPROVEMENT_PLAN §10: 60 directory searches / min / brand+IP
            o.AddPolicy(Policies.DirectorySearch, ctx => RateLimitPartition.GetFixedWindowLimiter(
                IpPartitionKey(ctx),
                _ => new FixedWindowRateLimiterOptions
                {
                    PermitLimit = 60,
                    Window = TimeSpan.FromMinutes(1),
                    QueueLimit = 0,
                    AutoReplenishment = true,
                }));

            // Anonymous backstop: 300 / min / brand+IP
            o.AddPolicy(Policies.PublicPerIp, ctx => RateLimitPartition.GetFixedWindowLimiter(
                IpPartitionKey(ctx),
                _ => new FixedWindowRateLimiterOptions
                {
                    PermitLimit = 300,
                    Window = TimeSpan.FromMinutes(1),
                    QueueLimit = 0,
                    AutoReplenishment = true,
                }));
        });

        return services;
    }

    public static string PartitionKey(HttpContext ctx) =>
        ctx.User.FindFirst("sub")?.Value is { Length: > 0 } sub
            ? $"{BrandOf(ctx)}:u:{sub}"
            : IpPartitionKey(ctx);

    public static string IpPartitionKey(HttpContext ctx) =>
        $"{BrandOf(ctx)}:ip:{ClientIpOf(ctx)}";

    /// <summary>
    /// The error code for a rejected request.
    ///
    /// <c>SlotHold</c> is not a generic throttle: it *is* the hold quota from
    /// IMPROVEMENT_PLAN §10, the same limit the database's <c>slot_holds_quota()</c> trigger
    /// enforces as <c>too_many_holds</c>. Because the HTTP limiter is set to the same 10/hour,
    /// it always fires first, so reporting <c>rate_limited</c> here made the <c>too_many_holds</c>
    /// prose unreachable and showed the patient a machine string instead. Report the code the
    /// condition actually is.
    /// </summary>
    public static string RejectionCodeFor(HttpContext ctx)
    {
        var policy = ctx.GetEndpoint()?.Metadata
            .GetOrderedMetadata<EnableRateLimitingAttribute>()
            .LastOrDefault(a => a.PolicyName is not null)?.PolicyName;

        return policy == Policies.SlotHold ? "too_many_holds" : "rate_limited";
    }

    private static string BrandOf(HttpContext ctx) =>
        ctx.GetResolvedBrand()?.Slug ?? "unresolved";

    /// <summary>
    /// Normalised rate-limit identity for the caller's address.
    ///
    /// <c>RemoteIpAddress</c> is the real client only once <c>UseForwardedHeaders</c> has
    /// rewritten it inside the trust boundary configured by <see cref="Network.NetworkOptions"/>;
    /// without a proxy it is already the client. Either way this is the authoritative address
    /// and the header is never read here directly.
    ///
    /// IPv6 is partitioned on the /64 prefix: an end user is routinely handed a whole /64 and
    /// can rotate addresses inside it at will, so limiting per full address would hand them an
    /// unlimited supply of partitions.
    /// </summary>
    public static string ClientIpOf(HttpContext ctx)
    {
        var address = ctx.Connection.RemoteIpAddress;
        if (address is null)
        {
            return "unknown";
        }

        if (address.IsIPv4MappedToIPv6)
        {
            address = address.MapToIPv4();
        }

        if (address.AddressFamily != AddressFamily.InterNetworkV6)
        {
            return address.ToString();
        }

        // Zero everything below the /64 and tag it, so a v6 prefix can never collide with a v4 key.
        var bytes = address.GetAddressBytes();
        Array.Clear(bytes, 8, 8);
        return $"{new IPAddress(bytes)}/64";
    }
}
