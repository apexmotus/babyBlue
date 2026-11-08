using Microsoft.Extensions.Options;

namespace BabyBlue.Api.Network;

/// <summary>
/// Fail-fast configuration checks, in the spirit of <c>DatabaseStartupValidator</c>: the
/// database role posture is verified at startup, and so is everything else whose absence
/// degrades silently rather than loudly.
///
/// Each check guards a setting whose default is safe locally but wrong in production, where
/// nothing in the request path would reveal the mistake.
/// </summary>
public static class RuntimeGuards
{
    public sealed class ObservabilityOptions
    {
        public const string SectionName = "Observability";

        /// <summary>
        /// HMAC salt for the pseudonymised <c>user_hash</c> on every access-log line (§16).
        /// With the built-in fallback the hashes are reversible by anyone holding the source,
        /// so the log stops being pseudonymised personal data and becomes identifiable —
        /// which is the POPIA distinction the access log depends on.
        /// </summary>
        public string? UserHashSalt { get; set; }
    }

    public static IServiceCollection AddBabyBlueRuntimeGuards(
        this IServiceCollection services,
        IConfiguration configuration,
        IHostEnvironment environment)
    {
        var isLocal = environment.IsDevelopment() || environment.EnvironmentName == "Testing";
        if (isLocal)
        {
            return services;
        }

        var failures = new List<string>();

        if (string.IsNullOrWhiteSpace(configuration["Observability:UserHashSalt"]))
        {
            failures.Add(
                "Observability:UserHashSalt is not set. The access log would fall back to a salt " +
                "compiled into the source, making every user_hash reversible and the log " +
                "identifiable rather than pseudonymised (§16).");
        }

        if (string.IsNullOrWhiteSpace(configuration["Supabase:Url"]))
        {
            failures.Add(
                "Supabase:Url is not set. JWT validation would default to the local development " +
                "issuer and reject every production token.");
        }

        // D-30: asymmetric JWKS is the default; a symmetric secret is for local and test
        // harnesses only. A shared HS256 secret is a signing key held by every verifier.
        if (!string.IsNullOrWhiteSpace(configuration["Supabase:JwtSecret"]) &&
            !configuration.GetValue("Supabase:AllowSymmetricJwtOutsideDevelopment", false))
        {
            failures.Add(
                "Supabase:JwtSecret is set outside Development. D-30 requires asymmetric JWKS " +
                "(ES256/RS256) in deployed environments. Remove the secret to use JWKS, or set " +
                "Supabase:AllowSymmetricJwtOutsideDevelopment=true to accept the risk explicitly.");
        }

        if (failures.Count > 0)
        {
            throw new InvalidOperationException(
                $"Configuration is not production-ready in environment '{environment.EnvironmentName}':"
                + Environment.NewLine
                + string.Join(Environment.NewLine, failures.Select(f => $"  - {f}")));
        }

        return services;
    }

    /// <summary>
    /// Records the proxy posture once at startup. Not fatal: a single instance addressed
    /// directly is a legitimate deployment. But if a balancer is in front and forwarding is
    /// off, every anonymous caller shares one rate-limit partition, and that is worth saying
    /// out loud rather than discovering from a brand-wide <c>queue_join</c> 429.
    /// </summary>
    public static void LogDeploymentPosture(IServiceProvider services, IHostEnvironment environment)
    {
        var logger = services.GetRequiredService<ILoggerFactory>().CreateLogger("BabyBlue.Api.Startup");
        var network = services.GetRequiredService<IOptions<NetworkOptions>>().Value;

        if (network.TrustForwardedHeaders)
        {
            logger.LogInformation(
                "forwarded_headers_trusted known_proxies={ProxyCount} known_networks={NetworkCount} forward_limit={ForwardLimit}",
                network.KnownProxies.Length,
                network.KnownNetworks.Length,
                network.ForwardLimit);
            return;
        }

        var message =
            "forwarded_headers_disabled: rate limiting partitions on the socket address. " +
            "If this instance is behind a load balancer, set Network:TrustForwardedHeaders " +
            "with the balancer's addresses, or every anonymous caller shares one partition.";

        if (environment.IsDevelopment() || environment.EnvironmentName == "Testing")
        {
            logger.LogDebug(message);
        }
        else
        {
            logger.LogWarning(message);
        }
    }
}
