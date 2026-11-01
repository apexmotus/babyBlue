using Microsoft.AspNetCore.Mvc;

namespace BabyBlue.Api.Middleware;

/// <summary>
/// Builds a <c>ProblemDetails</c> for a refusal a controller makes itself, in the same shape
/// <see cref="ProblemDetailsExceptionHandler"/> produces for one the database makes. Both set
/// <c>HttpContext.Items["error_code"]</c>, which is what the access log reports as <c>code</c>.
///
/// Controllers only refuse what the database cannot see: a request whose *shape* is wrong, such
/// as a date range too wide to be worth a query, or three parallel arrays of unequal length. The
/// meaning of a request is never decided here (§9).
/// </summary>
public static class ApiProblems
{
    public static ObjectResult Problem(HttpContext ctx, string code, int status, string? detail = null)
    {
        ctx.Items["error_code"] = code;

        var problem = new ProblemDetails
        {
            Type = $"https://babyblue.co.za/errors/{code}",
            Title = code,
            Status = status,
            Detail = detail,
        };
        problem.Extensions["code"] = code;
        problem.Extensions["request_id"] = ctx.TraceIdentifier;

        return new ObjectResult(problem)
        {
            StatusCode = status,
            ContentTypes = { "application/problem+json" },
        };
    }

    public static ObjectResult InvalidRange(HttpContext ctx, string? detail = null) =>
        Problem(ctx, "invalid_range", StatusCodes.Status400BadRequest, detail);

    public static ObjectResult InvalidArgument(HttpContext ctx, string? detail = null) =>
        Problem(ctx, "invalid_argument", StatusCodes.Status400BadRequest, detail);
}
