using System.Text.Json;
using BabyBlue.Api.Auth;
using BabyBlue.Api.Caching;
using BabyBlue.Api.Middleware;
using BabyBlue.Api.Network;
using BabyBlue.Api.Observability;
using BabyBlue.Api.RateLimiting;
using BabyBlue.Api.Security;
using BabyBlue.Data;
using Microsoft.AspNetCore.Cors.Infrastructure;

var builder = WebApplication.CreateBuilder(args);

// Structured JSON logging with the URL-printing framework loggers silenced (§16 PII rules).
// The single access-log line is emitted by RequestLoggingMiddleware from the route template.
builder.UseBabyBlueSerilog();
builder.Logging.AddFilter("Microsoft.AspNetCore.Hosting.Diagnostics", LogLevel.Warning);
builder.Logging.AddFilter("Microsoft.AspNetCore.Routing.EndpointMiddleware", LogLevel.Warning);
builder.Logging.AddFilter("Microsoft.AspNetCore.Mvc.Infrastructure", LogLevel.Warning);

// Every endpoint but one takes a small JSON body, so the global ceiling is small and the one
// multipart upload raises it per-route with [RequestSizeLimit]. The default 30 MB would let any
// JSON endpoint buffer 30 MB before a controller ever saw it.
builder.WebHost.ConfigureKestrel(o => o.Limits.MaxRequestBodySize = 64 * 1024);
builder.Services.Configure<Microsoft.AspNetCore.Http.Features.FormOptions>(o =>
{
    o.MultipartBodyLengthLimit = 6 * 1024 * 1024;
    o.ValueLengthLimit = 64 * 1024;
    o.MultipartHeadersLengthLimit = 16 * 1024;
});

builder.Services.AddBabyBlueRuntimeGuards(builder.Configuration, builder.Environment);
builder.Services.AddBabyBlueForwardedHeaders(builder.Configuration, builder.Environment);
builder.Services.AddBabyBlueTracing(builder.Configuration, builder.Environment);

builder.Services.AddProblemDetails();
builder.Services.AddExceptionHandler<ProblemDetailsExceptionHandler>();

builder.Services.AddCors();
builder.Services.AddSingleton<ICorsPolicyProvider, BrandCorsPolicyProvider>();

builder.Services.AddSupabaseJwtAuthentication(builder.Configuration, builder.Environment);

builder.Services.AddBabyBlueRateLimiting();
builder.Services.AddBabyBlueOutputCache();

builder.Services
    .AddControllers()
    .AddJsonOptions(o =>
    {
        o.JsonSerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower;
        o.JsonSerializerOptions.DictionaryKeyPolicy = JsonNamingPolicy.SnakeCaseLower;
    })
    .ConfigureApiBehaviorOptions(options =>
    {
        options.InvalidModelStateResponseFactory = context =>
        {
            var code = "invalid_argument";

            foreach (var key in context.ModelState.Keys)
            {
                if (context.ModelState[key]?.Errors.Count > 0)
                {
                    if (key.Contains("Phone", StringComparison.OrdinalIgnoreCase))
                    {
                        code = "profiles_phone_international";
                        break;
                    }
                    if (key.Contains("DisplayName", StringComparison.OrdinalIgnoreCase)
                        || key.Equals("Name", StringComparison.OrdinalIgnoreCase)
                        || key.Equals("name", StringComparison.OrdinalIgnoreCase)
                        || key.Contains("FirstName", StringComparison.OrdinalIgnoreCase))
                    {
                        code = "invalid_name";
                        break;
                    }
                    if (key.Contains("Email", StringComparison.OrdinalIgnoreCase))
                    {
                        code = "invalid_email";
                        break;
                    }
                    if (key.Contains("Slug", StringComparison.OrdinalIgnoreCase))
                    {
                        code = "invalid_slug";
                        break;
                    }
                }
            }

            var status = ProblemDetailsExceptionHandler.Codes.TryGetValue(code, out var s) ? s : 400;
            context.HttpContext.Items["error_code"] = code;
            var payload = new
            {
                type = $"https://babyblue.co.za/errors/{code}",
                title = code,
                status,
                code,
                request_id = context.HttpContext.TraceIdentifier
            };
            return new Microsoft.AspNetCore.Mvc.BadRequestObjectResult(payload)
            {
                ContentTypes = { "application/problem+json" }
            };
        };
    });

builder.Services.AddBabyBlueData(options =>
{
    builder.Configuration.GetSection(DatabaseOptions.SectionName).Bind(options);
    if (string.IsNullOrWhiteSpace(options.ConnectionString))
    {
        options.ConnectionString = builder.Configuration.GetConnectionString("BabyBlue") ?? string.Empty;
    }

    if (builder.Environment.IsDevelopment() || builder.Environment.EnvironmentName == "Testing")
    {
        options.AllowInsecureSslForLocalTesting = true;
    }
});

var app = builder.Build();

// Must precede every middleware that reads RemoteIpAddress or Request.Scheme (§12 rate
// limiting partitions on the client address). No-ops unless Network:TrustForwardedHeaders.
app.UseForwardedHeaders();
app.UseMiddleware<CorrelationIdMiddleware>();
app.UseMiddleware<RequestLoggingMiddleware>();
app.UseExceptionHandler();
app.UseMiddleware<SecurityHeadersMiddleware>();
app.UseCors(BrandCorsPolicyProvider.PolicyName);
app.UseMiddleware<BrandResolutionMiddleware>();
app.UseAuthentication();
app.UseMiddleware<CallerContextMiddleware>();
app.UseAuthorization();
app.UseRateLimiter();
app.UseOutputCache();
app.MapControllers();

RuntimeGuards.LogDeploymentPosture(app.Services, app.Environment);

app.Run();

public partial class Program;
