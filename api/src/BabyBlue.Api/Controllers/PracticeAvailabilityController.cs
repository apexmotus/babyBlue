using BabyBlue.Api.Caching;
using BabyBlue.Api.Middleware;
using BabyBlue.Api.RateLimiting;
using BabyBlue.Contracts.Practice;
using BabyBlue.Data.Generated;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace BabyBlue.Api.Controllers;

/// <summary>
/// Weekly availability rules and time off.
///
/// Availability is exposed as <c>start_time</c> / <c>end_time</c> text, never as a range type:
/// <c>availability_rules.during</c> is a generated, unwritable column, so neither the wire format
/// nor the generated contract ever mentions <c>timerange</c> (§6, §15).
/// </summary>
[ApiController]
[Route("v1/practices/{practice:guid}")]
[Authorize]
[EnableRateLimiting(Policies.AuthenticatedPerUser)]
public sealed class PracticeAvailabilityController(
    PracticeAvailabilityProcedures availability,
    IPublicReadCacheInvalidator cacheInvalidator) : ControllerBase
{
    [HttpGet("practitioners/{id:guid}/availability")]
    [ProducesResponseType<IReadOnlyList<PracticeAvailabilityListRow>>(StatusCodes.Status200OK)]
    public Task<IReadOnlyList<PracticeAvailabilityListRow>> List(
        Guid practice,
        Guid id,
        CancellationToken ct) =>
        availability.AvailabilityListAsync(practice, id, ct);

    /// <summary>
    /// Replace a practitioner's weekly rules. <c>overlapping_availability</c> → <c>409</c> and
    /// <c>invalid_range</c> → <c>400</c> both come from the procedure.
    ///
    /// The three arrays are read positionally, so unequal lengths would silently pair the wrong
    /// start with the wrong weekday rather than fail. That is a shape error, not a meaning error,
    /// so it is refused here before the call.
    /// </summary>
    [HttpPut("practitioners/{id:guid}/availability")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Set(
        Guid practice,
        Guid id,
        [FromBody] SetAvailabilityRequest body,
        CancellationToken ct)
    {
        if (!body.HasConsistentLengths())
        {
            return ApiProblems.InvalidArgument(
                HttpContext,
                "weekdays, starts and ends must be the same length; they are read positionally.");
        }

        await availability.AvailabilitySetAsync(
            practice, id, body.Weekdays, body.Starts, body.Ends, body.LocationId, ct);

        // Availability determines the bookable slots the public profile shows.
        await cacheInvalidator.EvictPractitionerAsync(BrandSlug(), id, ct);

        return NoContent();
    }

    /// <summary>Apply one start/end to several weekdays at once — the "same hours Mon–Fri" case.</summary>
    [HttpPost("practitioners/{id:guid}/availability/pattern")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> ApplyPattern(
        Guid practice,
        Guid id,
        [FromBody] ApplyAvailabilityPatternRequest body,
        CancellationToken ct)
    {
        await availability.AvailabilityApplyPatternAsync(
            practice, id, body.Weekdays, body.Start, body.End, body.LocationId, ct);

        await cacheInvalidator.EvictPractitionerAsync(BrandSlug(), id, ct);
        return NoContent();
    }

    [HttpGet("time-off")]
    [ProducesResponseType<IReadOnlyList<PracticeTimeoffListRow>>(StatusCodes.Status200OK)]
    public Task<IReadOnlyList<PracticeTimeoffListRow>> ListTimeOff(
        Guid practice,
        [FromQuery] Guid? practitioner = null,
        [FromQuery] DateTimeOffset? from = null,
        CancellationToken ct = default) =>
        availability.TimeoffListAsync(practice, practitioner, from, ct);

    /// <summary>
    /// Book time off. The procedure takes <c>date</c> bounds, so this is whole days in the
    /// practice's own timezone — the window is resolved against <c>practices.timezone</c> inside
    /// the procedure rather than against a hard-coded offset.
    /// </summary>
    [HttpPost("time-off")]
    [ProducesResponseType<PracticeIdResponse>(StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<PracticeIdResponse>> AddTimeOff(
        Guid practice,
        [FromBody] AddTimeOffRequest body,
        CancellationToken ct)
    {
        if (body.To < body.From)
        {
            return ApiProblems.InvalidRange(HttpContext, "'to' must not precede 'from'.");
        }

        var id = await availability.TimeoffAddAsync(
            practice, body.PractitionerId, body.From, body.To, body.Reason, ct);

        if (body.PractitionerId is { } practitionerId)
        {
            await cacheInvalidator.EvictPractitionerAsync(BrandSlug(), practitionerId, ct);
        }

        return Created($"/v1/practices/{practice}/time-off/{id}", new PracticeIdResponse(id));
    }

    [HttpDelete("time-off/{id:guid}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> RemoveTimeOff(Guid practice, Guid id, CancellationToken ct)
    {
        await availability.TimeoffRemoveAsync(practice, id, ct);
        await cacheInvalidator.EvictFacetsAsync(BrandSlug(), ct);
        return NoContent();
    }

    private string BrandSlug() => BrandKeys.GetResolvedBrand(HttpContext)?.Slug ?? string.Empty;
}
