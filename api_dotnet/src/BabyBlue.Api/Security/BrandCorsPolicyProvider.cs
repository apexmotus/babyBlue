using BabyBlue.Data;
using Microsoft.AspNetCore.Cors.Infrastructure;

namespace BabyBlue.Api.Security;

public sealed class BrandCorsPolicyProvider(
    IBrandRegistry brandRegistry,
    IHostEnvironment environment) : ICorsPolicyProvider
{
    public const string PolicyName = "brand-domains";

    private static readonly CorsPolicy EmptyPolicy = new CorsPolicyBuilder().Build();

    public async Task<CorsPolicy?> GetPolicyAsync(HttpContext context, string? policyName)
    {
        var rawOrigin = context.Request.Headers.Origin.ToString().Trim();
        if (string.IsNullOrEmpty(rawOrigin) ||
            !Uri.TryCreate(rawOrigin, UriKind.Absolute, out var originUri) ||
            originUri.Scheme is not ("https" or "http"))
        {
            return EmptyPolicy;
        }

        var originHost = originUri.Host.ToLowerInvariant();
        var allowed = false;

        if ((environment.IsDevelopment() || environment.EnvironmentName == "Testing") &&
            originHost is "localhost" or "127.0.0.1")
        {
            allowed = true;
        }
        else
        {
            var brand = await brandRegistry.ResolveAsync(originHost, context.RequestAborted);
            if (brand is not null && brand.Status == "active")
            {
                allowed = true;
            }
        }

        if (!allowed)
        {
            return EmptyPolicy;
        }

        var exactOrigin = originUri.GetLeftPart(UriPartial.Authority);
        return new CorsPolicyBuilder(exactOrigin)
            .WithMethods("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS")
            .WithHeaders("Authorization", "Content-Type", "X-Request-Id", "X-Tenant-Host")
            .WithExposedHeaders("X-Request-Id", "Retry-After")
            .SetPreflightMaxAge(TimeSpan.FromHours(1))
            .Build();
    }
}
