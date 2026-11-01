using System.ComponentModel.DataAnnotations;
using System.Text.Json;
using BabyBlue.Api.Middleware;
using BabyBlue.Api.RateLimiting;
using BabyBlue.Contracts.Practice;
using BabyBlue.Data.Generated;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace BabyBlue.Api.Controllers;

/// <summary>
/// Practice context: memberships, the two dashboard documents, setup progress, the calendar
/// reads, and the dashboard's queue and recent-bookings cards.
///
/// There is no membership check here and no practice-ownership check on <c>{practice}</c>. Every
/// procedure begins with <c>_require_member</c> or <c>_require_role</c>, so a caller who is not a
/// member of the practice in the route gets <c>42501</c> from PostgreSQL, which the error handler
/// maps to <c>403 forbidden</c>. Duplicating that here would create a second place for it to be
/// wrong (§9).
/// </summary>
[ApiController]
[Route("v1")]
[Authorize]
[EnableRateLimiting(Policies.AuthenticatedPerUser)]
public sealed class PracticeContextController(PracticeContextProcedures practiceContext) : ControllerBase
{
    /// <summary>How far a single calendar query may span. Wider is a reporting job, not a calendar.</summary>
    private const int MaxCalendarDays = 90;

    [HttpGet("practices")]
    [ProducesResponseType<IReadOnlyList<PracticeMembershipsListRow>>(StatusCodes.Status200OK)]
    public Task<IReadOnlyList<PracticeMembershipsListRow>> ListMemberships(CancellationToken ct) =>
        practiceContext.MembershipsListAsync(ct);

    /// <summary>
    /// The caller's platform role, or null. Routed here rather than on <c>PlatformController</c>
    /// because every signed-in user may ask (F-04); the other five platform routes are admin-only.
    /// </summary>
    [HttpGet("me/platform-role")]
    [ProducesResponseType<PlatformRoleResponse>(StatusCodes.Status200OK)]
    public async Task<ActionResult<PlatformRoleResponse>> GetPlatformRole(
        [FromServices] PlatformProcedures platform,
        CancellationToken ct) =>
        Ok(new PlatformRoleResponse(await platform.MyRoleAsync(ct)));

    /// <summary>The dashboard document, returned verbatim as it leaves the database (§15).</summary>
    [HttpGet("practices/{practice:guid}/dashboard")]
    [ProducesResponseType<JsonElement>(StatusCodes.Status200OK)]
    public Task<JsonElement> GetDashboard(Guid practice, CancellationToken ct) =>
        practiceContext.DashboardGetAsync(practice, ct);

    [HttpGet("practices/{practice:guid}/insights")]
    [ProducesResponseType<JsonElement>(StatusCodes.Status200OK)]
    public Task<JsonElement> GetInsights(
        Guid practice,
        [FromQuery, Range(1, 52)] int weeks = 12,
        CancellationToken ct = default) =>
        practiceContext.InsightsGetAsync(practice, weeks, ct);

    [HttpGet("practices/{practice:guid}/setup-progress")]
    [ProducesResponseType<PracticeSetupProgressRow>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public Task<PracticeSetupProgressRow> GetSetupProgress(Guid practice, CancellationToken ct) =>
        practiceContext.SetupProgressAsync(practice, ct);

    /// <summary>
    /// Appointments in a window. <c>practice_calendar_appointments</c> takes
    /// <c>p_include_cancelled</c> and does not take a practitioner, so there is no
    /// <c>practitioner</c> filter here — the plan's route table said otherwise and the signature
    /// wins. Callers filter by practitioner client-side, or the procedure gains the parameter.
    /// </summary>
    [HttpGet("practices/{practice:guid}/calendar/appointments")]
    [ProducesResponseType<IReadOnlyList<PracticeCalendarAppointmentsRow>>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> GetCalendarAppointments(
        Guid practice,
        [FromQuery] DateTimeOffset from,
        [FromQuery] DateTimeOffset to,
        [FromQuery(Name = "include_cancelled")] bool includeCancelled = false,
        CancellationToken ct = default)
    {
        if (RangeIsInvalid(from, to, out var detail))
        {
            return ApiProblems.InvalidRange(HttpContext, detail);
        }

        return Ok(await practiceContext.CalendarAppointmentsAsync(practice, from, to, includeCancelled, ct));
    }

    /// <summary>Weekly availability rules for the practice's calendar grid.</summary>
    [HttpGet("practices/{practice:guid}/calendar/availability")]
    [ProducesResponseType<IReadOnlyList<PracticeCalendarAvailabilityRow>>(StatusCodes.Status200OK)]
    public Task<IReadOnlyList<PracticeCalendarAvailabilityRow>> GetCalendarAvailability(
        Guid practice,
        CancellationToken ct) =>
        practiceContext.CalendarAvailabilityAsync(practice, ct);

    [HttpGet("practices/{practice:guid}/calendar/time-off")]
    [ProducesResponseType<IReadOnlyList<PracticeCalendarTimeoffRow>>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> GetCalendarTimeOff(
        Guid practice,
        [FromQuery] DateTimeOffset from,
        [FromQuery] DateTimeOffset to,
        CancellationToken ct = default)
    {
        if (RangeIsInvalid(from, to, out var detail))
        {
            return ApiProblems.InvalidRange(HttpContext, detail);
        }

        return Ok(await practiceContext.CalendarTimeoffAsync(practice, from, to, ct));
    }

    [HttpGet("practices/{practice:guid}/queue/preview")]
    [ProducesResponseType<IReadOnlyList<PracticeQueuePreviewRow>>(StatusCodes.Status200OK)]
    public Task<IReadOnlyList<PracticeQueuePreviewRow>> GetQueuePreview(
        Guid practice,
        [FromQuery, Range(1, 20)] int limit = 5,
        CancellationToken ct = default) =>
        practiceContext.QueuePreviewAsync(practice, limit, ct);

    [HttpGet("practices/{practice:guid}/queue/waiting-count")]
    [ProducesResponseType<QueueWaitingCountResponse>(StatusCodes.Status200OK)]
    public async Task<ActionResult<QueueWaitingCountResponse>> GetQueueWaitingCount(
        Guid practice,
        CancellationToken ct) =>
        Ok(new QueueWaitingCountResponse(await practiceContext.QueueWaitingCountAsync(practice, ct)));

    /// <summary>Recent bookings that came through the patient app — the D-22 "via BabyBlue" card.</summary>
    [HttpGet("practices/{practice:guid}/bookings/recent")]
    [ProducesResponseType<IReadOnlyList<PracticeRecentAppBookingsRow>>(StatusCodes.Status200OK)]
    public Task<IReadOnlyList<PracticeRecentAppBookingsRow>> GetRecentBookings(
        Guid practice,
        [FromQuery, Range(1, 90)] int days = 7,
        [FromQuery, Range(1, 100)] int limit = 10,
        CancellationToken ct = default) =>
        practiceContext.RecentAppBookingsAsync(practice, days, limit, ct);

    /// <summary>
    /// A window is invalid if it runs backwards or spans more than <see cref="MaxCalendarDays"/>.
    /// Both are refused with <c>400 invalid_range</c> rather than clamped, so the caller learns
    /// the request was wrong instead of silently receiving a different answer.
    /// </summary>
    private static bool RangeIsInvalid(DateTimeOffset from, DateTimeOffset to, out string? detail)
    {
        if (from == default || to == default)
        {
            detail = "Both 'from' and 'to' are required.";
            return true;
        }

        if (to < from)
        {
            detail = "'to' must not precede 'from'.";
            return true;
        }

        if ((to - from).TotalDays > MaxCalendarDays)
        {
            detail = $"The range must not exceed {MaxCalendarDays} days.";
            return true;
        }

        detail = null;
        return false;
    }
}
