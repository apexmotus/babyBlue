using System.Net;
using Microsoft.AspNetCore.HttpOverrides;

namespace BabyBlue.Api.Network;

/// <summary>
/// Trust boundary for <c>X-Forwarded-For</c> / <c>X-Forwarded-Proto</c>.
///
/// The IP rate limiters in §12 (<c>QueueJoin</c> 3/hour, <c>DirectorySearch</c> 60/min,
/// <c>PublicPerIp</c> 300/min) partition on the client address. Behind a load balancer the
/// socket address is the balancer's, so every anonymous caller shares one partition and
/// <c>QueueJoin</c> degrades to 3 joins/hour for an entire brand.
///
/// Reading the header fixes that, but only inside a trust boundary: with the known-proxy list
/// cleared, any caller can forge <c>X-Forwarded-For</c> and mint an unlimited number of
/// partitions, which is strictly worse than the collapse it replaces. So the proxy list is
/// mandatory whenever forwarding is enabled outside Development, and startup fails loudly
/// rather than silently trusting a spoofable header.
/// </summary>
public sealed class NetworkOptions
{
    public const string SectionName = "Network";

    /// <summary>True when this instance sits behind a reverse proxy or load balancer.</summary>
    public bool TrustForwardedHeaders { get; set; }

    /// <summary>Exact proxy addresses permitted to set <c>X-Forwarded-For</c>.</summary>
    public string[] KnownProxies { get; set; } = [];

    /// <summary>Proxy networks in CIDR form, e.g. <c>10.0.0.0/8</c>.</summary>
    public string[] KnownNetworks { get; set; } = [];

    /// <summary>
    /// Shared API hostnames that serve every brand, e.g. <c>api.babyblue.co.za</c>. Only on
    /// these is <c>X-Tenant-Host</c> / <c>Origin</c> consulted to pick a brand, because only
    /// there can <c>Request.Host</c> not identify one (F-07). Empty falls back to the
    /// <c>api.</c> label convention.
    /// </summary>
    public string[] PlatformApiHosts { get; set; } = [];

    /// <summary>
    /// Number of proxy hops to unwind. Must equal the real hop count: a larger value lets the
    /// client append entries that are then read as the originating address.
    /// </summary>
    public int ForwardLimit { get; set; } = 1;
}

public static class ForwardedHeadersSetup
{
    public static IServiceCollection AddBabyBlueForwardedHeaders(
        this IServiceCollection services,
        IConfiguration configuration,
        IHostEnvironment environment)
    {
        var network = new NetworkOptions();
        configuration.GetSection(NetworkOptions.SectionName).Bind(network);
        services.Configure<NetworkOptions>(o => configuration.GetSection(NetworkOptions.SectionName).Bind(o));

        if (!network.TrustForwardedHeaders)
        {
            return services;
        }

        var isLocal = environment.IsDevelopment() || environment.EnvironmentName == "Testing";
        if (!isLocal && network.KnownProxies.Length == 0 && network.KnownNetworks.Length == 0)
        {
            throw new InvalidOperationException(
                "Network:TrustForwardedHeaders is true but neither Network:KnownProxies nor " +
                "Network:KnownNetworks is configured. An unrestricted X-Forwarded-For is " +
                "attacker-controlled and would let any caller forge the rate-limit partition key. " +
                "Set the load balancer's addresses, or set Network:TrustForwardedHeaders=false.");
        }

        services.Configure<ForwardedHeadersOptions>(o =>
        {
            o.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
            o.ForwardLimit = Math.Max(1, network.ForwardLimit);

            // Defaults trust loopback; replace wholesale with the configured boundary.
            o.KnownProxies.Clear();
            o.KnownIPNetworks.Clear();

            foreach (var proxy in network.KnownProxies)
            {
                if (IPAddress.TryParse(proxy.Trim(), out var address))
                {
                    o.KnownProxies.Add(address);
                }
                else
                {
                    throw new InvalidOperationException(
                        $"Network:KnownProxies contains '{proxy}', which is not a valid IP address.");
                }
            }

            foreach (var cidr in network.KnownNetworks)
            {
                o.KnownIPNetworks.Add(ParseCidr(cidr));
            }

            if (isLocal && o.KnownProxies.Count == 0 && o.KnownIPNetworks.Count == 0)
            {
                o.KnownProxies.Add(IPAddress.Loopback);
                o.KnownProxies.Add(IPAddress.IPv6Loopback);
            }
        });

        return services;
    }

    public static System.Net.IPNetwork ParseCidr(string cidr)
    {
        var parts = cidr.Trim().Split('/', 2);
        if (parts.Length != 2 ||
            !IPAddress.TryParse(parts[0], out var prefix) ||
            !int.TryParse(parts[1], out var length))
        {
            throw new InvalidOperationException(
                $"Network:KnownNetworks contains '{cidr}', which is not valid CIDR notation (e.g. 10.0.0.0/8).");
        }

        var maxLength = prefix.AddressFamily == System.Net.Sockets.AddressFamily.InterNetworkV6 ? 128 : 32;
        if (length < 0 || length > maxLength)
        {
            throw new InvalidOperationException(
                $"Network:KnownNetworks entry '{cidr}' has an out-of-range prefix length.");
        }

        return new System.Net.IPNetwork(prefix, length);
    }
}
