using BabyBlue.Api.Middleware;
using Microsoft.AspNetCore.OutputCaching;
using Microsoft.Extensions.Primitives;

namespace BabyBlue.Api.Caching;

public static class CachePolicies
{
    public const string NoCache = "NoCache";
    public const string Facets = "Facets";
    public const string Listing = "Listing";
    public const string Profile = "Profile";
    public const string QueueInfo = "QueueInfo";
}

public interface IPublicReadCacheInvalidator
{
    ValueTask EvictFacetsAsync(string brandSlug, CancellationToken ct = default);
    ValueTask EvictPractitionerAsync(string brandSlug, Guid practitionerId, CancellationToken ct = default);
}

public sealed class PublicReadCacheInvalidator(IOutputCacheStore store) : IPublicReadCacheInvalidator
{
    public async ValueTask EvictFacetsAsync(string brandSlug, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(brandSlug)) return;
        await store.EvictByTagAsync($"brand:{brandSlug}:facets", ct);
        await store.EvictByTagAsync($"brand:{brandSlug}:listing", ct);
    }

    public async ValueTask EvictPractitionerAsync(string brandSlug, Guid practitionerId, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(brandSlug)) return;
        await store.EvictByTagAsync($"brand:{brandSlug}:practitioner:{practitionerId}", ct);
        await store.EvictByTagAsync($"brand:{brandSlug}:listing", ct);
        await store.EvictByTagAsync($"brand:{brandSlug}:facets", ct);
    }
}

public static class PublicReadCache
{
    public static bool IsCacheableAnonymousRead(HttpContext httpContext) =>
        (HttpMethods.IsGet(httpContext.Request.Method) || HttpMethods.IsHead(httpContext.Request.Method)) &&
        !httpContext.Request.Headers.ContainsKey("Authorization") &&
        httpContext.User.Identity?.IsAuthenticated != true;

    public static IServiceCollection AddBabyBlueOutputCache(this IServiceCollection services)
    {
        services.AddSingleton<IPublicReadCacheInvalidator, PublicReadCacheInvalidator>();

        services.AddOutputCache(o =>
        {
            o.AddBasePolicy(b => b.NoCache());

            o.AddPolicy(CachePolicies.NoCache, b => b.NoCache());

            // No query keys: neither `public_city_list()` nor `public_speciality_list()` takes an
            // argument, so any query string would fork identical bodies across cache entries.
            o.AddPolicy(CachePolicies.Facets, new AnonymousBrandOutputCachePolicy(
                expiration: TimeSpan.FromHours(1),
                cacheControlHeader: "public, max-age=3600",
                queryKeys: [],
                routeKeys: [],
                tagFactory: static (ctx, slug) => [$"brand:{slug}:facets"]));

            o.AddPolicy(CachePolicies.Listing, new AnonymousBrandOutputCachePolicy(
                expiration: TimeSpan.FromSeconds(60),
                cacheControlHeader: "public, max-age=60, stale-while-revalidate=30",
                queryKeys: ["q", "speciality", "city", "verified_only", "limit", "offset"],
                routeKeys: [],
                tagFactory: static (ctx, slug) => [$"brand:{slug}:listing"]));

            o.AddPolicy(CachePolicies.Profile, new AnonymousBrandOutputCachePolicy(
                expiration: TimeSpan.FromMinutes(5),
                cacheControlHeader: "public, max-age=300",
                queryKeys: [],
                routeKeys: ["id"],
                tagFactory: static (ctx, slug) =>
                {
                    var id = ctx.Request.RouteValues["id"]?.ToString() ?? "unknown";
                    return [$"brand:{slug}:practitioner:{id}"];
                }));

            o.AddPolicy(CachePolicies.QueueInfo, new AnonymousBrandOutputCachePolicy(
                expiration: TimeSpan.FromSeconds(10),
                cacheControlHeader: "public, max-age=10",
                queryKeys: [],
                routeKeys: ["slug"],
                tagFactory: static (ctx, slug) =>
                {
                    var queueSlug = ctx.Request.RouteValues["slug"]?.ToString() ?? "unknown";
                    return [$"brand:{slug}:queue:{queueSlug}"];
                }));
        });

        return services;
    }

    private sealed class AnonymousBrandOutputCachePolicy(
        TimeSpan expiration,
        string cacheControlHeader,
        string[] queryKeys,
        string[] routeKeys,
        Func<HttpContext, string, string[]> tagFactory) : IOutputCachePolicy
    {
        public ValueTask CacheRequestAsync(OutputCacheContext context, CancellationToken cancellation)
        {
            var httpContext = context.HttpContext;
            if (!IsCacheableAnonymousRead(httpContext))
            {
                context.EnableOutputCaching = false;
                context.AllowCacheLookup = false;
                context.AllowCacheStorage = false;
                context.AllowLocking = false;
                httpContext.Response.Headers["Cache-Control"] = "no-store";
                return ValueTask.CompletedTask;
            }

            var brandSlug = httpContext.GetResolvedBrand()?.Slug ?? "none";

            context.EnableOutputCaching = true;
            context.AllowCacheLookup = true;
            context.AllowCacheStorage = true;
            context.AllowLocking = true;
            context.ResponseExpirationTimeSpan = expiration;

            context.CacheVaryByRules.VaryByHost = true;
            context.CacheVaryByRules.VaryByValues["brand"] = brandSlug;

            if (queryKeys.Length > 0)
            {
                context.CacheVaryByRules.QueryKeys = new StringValues(queryKeys);
            }
            if (routeKeys.Length > 0)
            {
                context.CacheVaryByRules.RouteValueNames = new StringValues(routeKeys);
            }

            foreach (var tag in tagFactory(httpContext, brandSlug))
            {
                context.Tags.Add(tag);
            }

            httpContext.Response.Headers["Cache-Control"] = cacheControlHeader;
            httpContext.Response.Headers["X-Cache"] = "MISS";
            return ValueTask.CompletedTask;
        }

        public ValueTask ServeFromCacheAsync(OutputCacheContext context, CancellationToken cancellation)
        {
            context.HttpContext.Response.Headers["Cache-Control"] = cacheControlHeader;
            context.HttpContext.Response.Headers["X-Cache"] = "HIT";
            context.HttpContext.Response.OnStarting(() =>
            {
                context.HttpContext.Response.Headers["Cache-Control"] = cacheControlHeader;
                context.HttpContext.Response.Headers["X-Cache"] = "HIT";
                return Task.CompletedTask;
            });
            return ValueTask.CompletedTask;
        }

        public ValueTask ServeResponseAsync(OutputCacheContext context, CancellationToken cancellation)
        {
            var response = context.HttpContext.Response;
            if (!IsCacheableAnonymousRead(context.HttpContext) ||
                response.StatusCode != StatusCodes.Status200OK ||
                !StringValues.IsNullOrEmpty(response.Headers.SetCookie))
            {
                context.AllowCacheStorage = false;
                if (!response.HasStarted)
                {
                    response.Headers["Cache-Control"] = "no-store";
                }
            }

            return ValueTask.CompletedTask;
        }
    }
}
