using System.Collections.Frozen;
using BabyBlue.Data;
using Microsoft.AspNetCore.Cors.Infrastructure;
using Microsoft.AspNetCore.Diagnostics;
using Npgsql;

namespace BabyBlue.Api.Middleware;

public sealed class ProblemDetailsExceptionHandler(ILogger<ProblemDetailsExceptionHandler> log)
    : IExceptionHandler
{
    public static readonly FrozenDictionary<string, int> Codes = new Dictionary<string, int>
    {
        ["not_authenticated"]        = 401,
        ["forbidden"]                = 403,
        ["not_found"]                = 404,
        ["not_editable"]             = 403,
        ["slot_unavailable"]         = 409,
        ["hold_expired"]             = 409,
        ["too_late_to_cancel"]       = 409,
        ["not_cancellable"]          = 409,
        ["not_reschedulable"]        = 409,
        ["too_early_to_check_in"]    = 409,
        ["not_checkin_able"]         = 409,
        ["invalid_transition"]       = 409,
        ["user_not_found"]           = 409,
        ["sole_owner"]               = 409,
        ["has_records"]              = 409,
        ["registration_in_use"]      = 409,
        ["last_practitioner"]        = 409,
        ["service_in_use"]           = 409,
        ["overlapping_availability"] = 409,
        ["queue_closed"]             = 409,
        ["consent_required"]         = 409,
        ["too_many_holds"]           = 429,
        ["invalid_registration"]     = 400,
        ["invalid_name"]             = 400,
        ["invalid_range"]            = 400,
        ["price_required"]           = 400,
        ["metric_unknown"]           = 400,
        ["asset_too_large"]          = 413,
        ["profiles_phone_international"] = 400,
    }.ToFrozenDictionary(StringComparer.Ordinal);

    /// <summary>
    /// Codes this layer raises itself, which no procedure can raise: transport, configuration
    /// and gateway conditions. They are kept apart from <see cref="Codes"/> because
    /// <see cref="Codes"/> is the procedure vocabulary that the 3-way parity gate compares
    /// against the SQL <c>raise exception</c> literals — but they still reach a user, so they
    /// still need prose in <c>src/lib/api/messages.ts</c>. The parity gate checks the union.
    /// </summary>
    public static readonly FrozenDictionary<string, int> TransportCodes = new Dictionary<string, int>
    {
        ["rate_limited"]         = 429,
        ["invalid_input"]        = 400,
        ["invalid_argument"]     = 400,
        ["invalid_email"]        = 400,
        ["invalid_slug"]         = 400,
        ["token_expired"]        = 401,
        ["brand_not_found"]      = 404,
        ["brand_unavailable"]    = 403,
        ["conflict"]             = 409,
        ["statement_timeout"]    = 504,
        ["too_many_connections"] = 503,
        ["client_closed"]        = 499,
        ["internal_error"]       = 500,
        ["api_not_configured"]   = 500,
    }.ToFrozenDictionary(StringComparer.Ordinal);

    /// <summary>Every code this API can put in <c>ProblemDetails.extensions["code"]</c>.</summary>
    public static IReadOnlyCollection<string> AllCodes { get; } =
        Codes.Keys.Concat(TransportCodes.Keys).ToHashSet(StringComparer.Ordinal);

    public async ValueTask<bool> TryHandleAsync(
        HttpContext ctx, Exception ex, CancellationToken ct)
    {
        var (status, code, detail) = ex switch
        {
            ProcedureNotFoundException => (StatusCodes.Status404NotFound, "not_found", (string?)null),
            PostgresException pg => Classify(pg),
            OperationCanceledException when ctx.RequestAborted.IsCancellationRequested => (499, "client_closed", (string?)null),
            _ => (StatusCodes.Status500InternalServerError, "internal_error", (string?)null),
        };

        ctx.Items["error_code"] = code;
        var procName = ctx.RequestServices.GetService<ICallerAccessor>()?.LastProcedure
            ?? ctx.Items["procedure"]?.ToString();
        if (!string.IsNullOrEmpty(procName))
        {
            ctx.Items["procedure"] = procName;
        }
        if (ex is PostgresException pgEx)
        {
            ctx.Items["sql_state"] = pgEx.SqlState;
        }

        // Never log or serialise PostgresException.Detail, .Hint, .Where, or SQL text.
        log.LogWarning(
            "procedure_failed proc={Proc} code={Code} sqlstate={SqlState} status={Status} request_id={RequestId}",
            procName,
            code,
            (ex as PostgresException)?.SqlState,
            status,
            ctx.TraceIdentifier);

        // Re-apply correlation, security, and CORS headers cleared by ExceptionHandlerMiddleware.
        ctx.Response.Headers[CorrelationIdMiddleware.HeaderName] = ctx.TraceIdentifier;
        SecurityHeadersMiddleware.ApplyHeaders(ctx);
        await ReapplyCorsHeadersAsync(ctx);

        var extensions = new Dictionary<string, object?>
        {
            ["request_id"] = ctx.TraceIdentifier,
        };
        if (status != StatusCodes.Status500InternalServerError)
        {
            extensions["code"] = code;
        }
        else
        {
            extensions["code"] = "internal_error";
        }

        await Results.Problem(
            type: $"https://babyblue.co.za/errors/{code}",
            title: code,
            detail: detail,
            statusCode: status,
            extensions: extensions).ExecuteAsync(ctx);

        return true;
    }

    public static (int Status, string Code, string? Detail) Classify(PostgresException pg)
    {
        // Step 1: PostgresException.MessageText (authoritative semantic code)
        var text = (pg.MessageText ?? string.Empty).Trim();
        if (text.StartsWith("metric_unknown:", StringComparison.Ordinal))
        {
            var metricKey = text["metric_unknown:".Length..].Trim();
            return (StatusCodes.Status400BadRequest, "metric_unknown", metricKey);
        }

        if (Codes.TryGetValue(text, out var mappedStatus))
        {
            return (mappedStatus, text, null);
        }

        // Step 2: PostgresException.ConstraintName
        if (!string.IsNullOrEmpty(pg.ConstraintName))
        {
            if (pg.ConstraintName is "no_double_booking" or "no_overlapping_holds" or "no_double_hold")
            {
                return (StatusCodes.Status409Conflict, "slot_unavailable", null);
            }

            if (Codes.TryGetValue(pg.ConstraintName, out var constraintStatus))
            {
                return (constraintStatus, pg.ConstraintName, null);
            }
        }

        // Step 3: SqlState terminal fallback
        return pg.SqlState switch
        {
            "22023"            => (StatusCodes.Status400BadRequest, "invalid_input", null),
            "23P01"            => (StatusCodes.Status409Conflict, "slot_unavailable", null),
            "23505" or "23503" => (StatusCodes.Status409Conflict, "conflict", null),
            "42501"            => (StatusCodes.Status403Forbidden, "forbidden", null),
            "28000"            => (StatusCodes.Status401Unauthorized, "not_authenticated", null),
            "P0002"            => (StatusCodes.Status404NotFound, "not_found", null),
            "23514"            => (StatusCodes.Status400BadRequest, "invalid_input", null),
            "57014"            => (StatusCodes.Status504GatewayTimeout, "statement_timeout", null),
            "54000"            => (StatusCodes.Status429TooManyRequests, "too_many_holds", null),
            "53300"            => (StatusCodes.Status503ServiceUnavailable, "too_many_connections", null),
            _                  => (StatusCodes.Status500InternalServerError, "internal_error", null),
        };
    }

    internal static async Task ReapplyCorsHeadersAsync(HttpContext ctx)
    {
        if (!ctx.Request.Headers.ContainsKey("Origin"))
        {
            return;
        }

        var corsService = ctx.RequestServices.GetService<ICorsService>();
        var corsPolicyProvider = ctx.RequestServices.GetService<ICorsPolicyProvider>();
        if (corsService is null || corsPolicyProvider is null)
        {
            return;
        }

        var policy = await corsPolicyProvider.GetPolicyAsync(ctx, "brand-domains");
        if (policy is not null)
        {
            var result = corsService.EvaluatePolicy(ctx, policy);
            corsService.ApplyResult(result, ctx.Response);
        }
    }
}
