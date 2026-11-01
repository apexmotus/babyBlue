using System.Text.Json;
using BabyBlue.Contracts.Auth;
using Dapper;
using Microsoft.Extensions.Caching.Memory;
using Npgsql;

namespace BabyBlue.Data;

public interface IBrandRegistry
{
    Task<ResolvedBrand?> ResolveAsync(string host, CancellationToken ct = default);
    void Invalidate(string host);
}

public sealed class BrandRegistry : IBrandRegistry, IDisposable
{
    private static readonly TimeSpan PositiveTtl = TimeSpan.FromMinutes(5);
    private static readonly TimeSpan NegativeTtl = TimeSpan.FromSeconds(30);

    /// <summary>
    /// Bounded entry count. Brand resolution runs in <c>BrandResolutionMiddleware</c>, which
    /// sits before <c>UseRateLimiter</c> in the §7 pipeline — it has to, because the rate-limit
    /// partition key needs the brand. That means an unresolved <c>Host</c> or
    /// <c>X-Tenant-Host</c> buys an unauthenticated caller one connection, one transaction and
    /// one <c>resolve_brand</c> call, before any limiter can refuse them. A shared unbounded
    /// cache would also grow one entry per distinct hostname sprayed at it.
    ///
    /// So this cache is its own, and it is capped. Real deployments hold a handful of brands
    /// and a few domains each; the cap is far above that and exists only to bound an attack.
    /// </summary>
    private const long MaxCachedHosts = 4096;

    private readonly NpgsqlDataSource _dataSource;
    private readonly MemoryCache _cache;
    private readonly bool _ownsCache;

    public BrandRegistry(NpgsqlDataSource dataSource)
    {
        _dataSource = dataSource;
        _cache = new MemoryCache(new MemoryCacheOptions
        {
            SizeLimit = MaxCachedHosts,
            CompactionPercentage = 0.25,
        });
        _ownsCache = true;
    }

    public void Dispose()
    {
        if (_ownsCache)
        {
            _cache.Dispose();
        }
    }

    private sealed record CacheBox(ResolvedBrand? Brand);

    private sealed record BrandRow(
        Guid BrandId,
        string Slug,
        string SchemaName,
        string Status,
        string DisplayName,
        JsonElement Theme,
        JsonElement CopyOverrides,
        JsonElement Features,
        string? LogoUrl,
        string? FaviconUrl,
        string SupportEmail);

    public async Task<ResolvedBrand?> ResolveAsync(string host, CancellationToken ct = default)
    {
        var normalized = NormalizeHost(host);

        // Refuse what cannot possibly be a registered domain without spending a connection.
        // This is the cheap half of the pre-auth guard; the cache cap is the other half.
        if (!IsPlausibleHost(normalized))
        {
            return null;
        }

        var cacheKey = $"brand:host:{normalized}";
        if (_cache.TryGetValue<CacheBox>(cacheKey, out var cached) && cached is not null)
        {
            return cached.Brand;
        }

        await using var conn = await _dataSource.OpenConnectionAsync(ct);
        await using var tx = await conn.BeginTransactionAsync(ct);

        await using (var preamble = new NpgsqlCommand(
            """
            set local search_path = public;
            set local role anon;
            set local statement_timeout = '5s';
            """,
            conn,
            tx))
        {
            await preamble.ExecuteNonQueryAsync(ct);
        }

        var row = await conn.QuerySingleOrDefaultAsync<BrandRow>(
            new CommandDefinition(
                "select * from public.resolve_brand(p_host => @Host)",
                new { Host = normalized },
                tx,
                cancellationToken: ct));

        await tx.CommitAsync(ct);

        var resolved = row is null
            ? null
            : new ResolvedBrand(
                row.BrandId,
                row.Slug,
                row.SchemaName,
                row.Status,
                row.DisplayName,
                row.Theme,
                row.CopyOverrides,
                row.Features,
                row.LogoUrl,
                row.FaviconUrl,
                row.SupportEmail);

        _cache.Set(
            cacheKey,
            new CacheBox(resolved),
            new MemoryCacheEntryOptions
            {
                Size = 1,
                AbsoluteExpirationRelativeToNow = resolved is not null ? PositiveTtl : NegativeTtl,
            });
        return resolved;
    }

    public void Invalidate(string host)
    {
        var normalized = NormalizeHost(host);
        if (!string.IsNullOrEmpty(normalized))
        {
            _cache.Remove($"brand:host:{normalized}");
        }
    }

    public static string NormalizeHost(string? host)
    {
        if (string.IsNullOrWhiteSpace(host))
        {
            return string.Empty;
        }

        var trimmed = host.Trim().ToLowerInvariant();
        var colonIdx = trimmed.IndexOf(':');
        return colonIdx >= 0 ? trimmed[..colonIdx] : trimmed;
    }

    /// <summary>
    /// Whether a normalised host could be a registered domain at all. Purely syntactic, so it
    /// can run before the database is touched and can never accept something the registry
    /// would reject. A bare label with no dot is allowed, because local and test hosts
    /// (<c>localhost</c>) are legitimately registered.
    /// </summary>
    public static bool IsPlausibleHost(string normalizedHost)
    {
        if (string.IsNullOrEmpty(normalizedHost) || normalizedHost.Length > 253)
        {
            return false;
        }

        if (normalizedHost.StartsWith('.') || normalizedHost.EndsWith('.') ||
            normalizedHost.Contains("..", StringComparison.Ordinal))
        {
            return false;
        }

        foreach (var label in normalizedHost.Split('.'))
        {
            if (label.Length is 0 or > 63 ||
                label.StartsWith('-') || label.EndsWith('-'))
            {
                return false;
            }

            foreach (var ch in label)
            {
                if (!char.IsAsciiLetterOrDigit(ch) && ch != '-')
                {
                    return false;
                }
            }
        }

        return true;
    }
}
