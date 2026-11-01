using System.Diagnostics;
using BabyBlue.Data;
using OpenTelemetry.Resources;
using OpenTelemetry.Trace;
using Serilog;
using Serilog.Events;
using Serilog.Formatting.Compact;

namespace BabyBlue.Api.Observability;

/// <summary>
/// Structured logging and tracing, built around one rule from §16: <b>nothing that identifies a
/// person leaves this process.</b>
///
/// That rule is why the configuration below is mostly subtraction. The default ASP.NET Core
/// request log prints the full path and query string, which on this API means appointment ids,
/// client ids and queue tokens; Serilog's own request logging does the same. Both are off, and
/// the single access-log line comes from <c>RequestLoggingMiddleware</c>, which emits the route
/// <em>template</em> and an HMAC of the user id.
///
/// Tracing keeps the same posture: the HTTP instrumentation's enrichment is trimmed to the route
/// template and status, and the database spans carry the procedure name — never SQL text, never
/// parameter values.
/// </summary>
public static class ObservabilitySetup
{
    public const string ServiceName = "babyblue-api";

    public static void UseBabyBlueSerilog(this IHostApplicationBuilder builder)
    {
        var logger = new LoggerConfiguration()
            .MinimumLevel.Information()
            .MinimumLevel.Override("Microsoft", LogEventLevel.Warning)
            .MinimumLevel.Override("Microsoft.Hosting.Lifetime", LogEventLevel.Information)
            // These two print raw URLs, which on this API are personal data.
            .MinimumLevel.Override("Microsoft.AspNetCore.Hosting.Diagnostics", LogEventLevel.Warning)
            .MinimumLevel.Override("Microsoft.AspNetCore.Routing", LogEventLevel.Warning)
            .MinimumLevel.Override("Npgsql", LogEventLevel.Warning)
            .Enrich.FromLogContext()
            .Enrich.WithProperty("service", ServiceName)
            .WriteTo.Console(new CompactJsonFormatter())
            .CreateLogger();

        builder.Logging.ClearProviders();
        builder.Logging.AddSerilog(logger, dispose: true);
    }

    public static IServiceCollection AddBabyBlueTracing(
        this IServiceCollection services,
        IConfiguration configuration,
        IHostEnvironment environment)
    {
        _ = environment;
        var otlpEndpoint = configuration["Observability:OtlpEndpoint"];

        services
            .AddOpenTelemetry()
            .ConfigureResource(r => r.AddService(
                serviceName: ServiceName,
                serviceVersion: typeof(ObservabilitySetup).Assembly.GetName().Version?.ToString() ?? "0.0.0",
                serviceInstanceId: Environment.MachineName))
            .WithTracing(tracing =>
            {
                tracing.AddSource(ProcedureGateway.ActivitySource.Name);

                tracing.AddAspNetCoreInstrumentation(o =>
                {
                    // Health checks would otherwise dominate the trace volume.
                    o.Filter = ctx => !ctx.Request.Path.StartsWithSegments("/health");

                    o.EnrichWithHttpRequest = (activity, request) =>
                    {
                        // The route template, never the path: `/v1/me/appointments/{id}` rather
                        // than the id itself. Queue token routes are excluded entirely (§16).
                        var template = (request.HttpContext.GetEndpoint() as RouteEndpoint)?.RoutePattern.RawText;
                        activity.DisplayName = $"{request.Method} {template ?? "unmatched"}";
                        activity.SetTag("http.route", template);
                        activity.SetTag("url.query", null);
                        activity.SetTag("url.full", null);
                    };

                    o.EnrichWithHttpResponse = (activity, response) =>
                    {
                        activity.SetTag("bb.error_code", response.HttpContext.Items["error_code"]);
                        activity.SetTag("bb.procedure", response.HttpContext.Items["procedure"]);
                    };

                    o.RecordException = true;
                });

                // No exporter unless one is configured: spans are then collected and dropped,
                // which costs almost nothing and means a missing collector cannot fail startup
                // or block requests on a dead endpoint.
                if (!string.IsNullOrWhiteSpace(otlpEndpoint))
                {
                    tracing.AddOtlpExporter(o => o.Endpoint = new Uri(otlpEndpoint));
                }
            });

        return services;
    }

    /// <summary>
    /// Scrubs a span before it is exported. Belt and braces over the enrichment above: a future
    /// instrumentation package that starts tagging a URL should not quietly begin exporting
    /// appointment ids.
    /// </summary>
    public static void ScrubSensitiveTags(Activity activity)
    {
        activity.SetTag("url.full", null);
        activity.SetTag("url.query", null);
        activity.SetTag("http.request.header.authorization", null);
        activity.SetTag("http.request.header.cookie", null);
        activity.SetTag("db.statement", null);
    }
}
