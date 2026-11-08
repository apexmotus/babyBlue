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
/// Creating a practice, onboarding one, and its settings and locations.
///
/// The two creation routes carry <c>Policies.PracticeCreate</c> (3/day/user) rather than the
/// per-user default: a practice is a tenant, and tenant creation is the one authenticated action
/// whose abuse costs more than bandwidth. Both are rate-limited on the same partition, so three
/// of either, or any mix, is the daily budget.
///
/// Only <c>practice_owner</c> may change settings. That is <c>_require_role</c> inside
/// <c>practice_settings_update</c>, not an attribute here — a receptionist's token reaching this
/// route gets <c>403</c> from PostgreSQL.
/// </summary>
[ApiController]
[Route("v1/practices")]
[Authorize]
[EnableRateLimiting(Policies.AuthenticatedPerUser)]
public sealed class PracticeSettingsController(
    PracticeSettingsProcedures settings,
    IPublicReadCacheInvalidator cacheInvalidator) : ControllerBase
{
    /// <summary>
    /// Create a practice. A duplicate slug is a unique-constraint violation (<c>23505</c>), which
    /// the error handler maps to <c>409 conflict</c>.
    /// </summary>
    [HttpPost]
    [EnableRateLimiting(Policies.PracticeCreate)]
    [ProducesResponseType<PracticeIdResponse>(StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    [ProducesResponseType(StatusCodes.Status429TooManyRequests)]
    public async Task<ActionResult<PracticeIdResponse>> Create(
        [FromBody] CreatePracticeRequest body,
        CancellationToken ct)
    {
        var id = await settings.CreateAsync(body.Name, body.Slug, ct);
        await cacheInvalidator.EvictFacetsAsync(BrandSlug(), ct);
        return Created($"/v1/practices/{id}", new PracticeIdResponse(id));
    }

    /// <summary>
    /// Create a practice with its first location, practitioner, service and weekly hours in one
    /// transaction — the onboarding wizard. One procedure, so a half-finished practice is not a
    /// state the database can be left in.
    /// </summary>
    [HttpPost("onboard")]
    [EnableRateLimiting(Policies.PracticeCreate)]
    [ProducesResponseType<PracticeIdResponse>(StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    [ProducesResponseType(StatusCodes.Status429TooManyRequests)]
    public async Task<ActionResult<PracticeIdResponse>> Onboard(
        [FromBody] OnboardPracticeRequest body,
        CancellationToken ct)
    {
        var id = await settings.OnboardAsync(
            body.Name,
            body.Slug,
            body.CityId,
            body.Address,
            body.PractitionerName,
            body.Title,
            body.SpecialitySlug,
            body.Bio,
            body.Languages,
            body.ServiceName,
            body.DurationMin,
            body.BufferMin,
            body.PriceCents,
            body.Weekdays,
            body.Start,
            body.End,
            ct);

        await cacheInvalidator.EvictFacetsAsync(BrandSlug(), ct);
        return Created($"/v1/practices/{id}", new PracticeIdResponse(id));
    }

    [HttpGet("{practice:guid}/settings")]
    [ProducesResponseType<PracticeSettingsGetRow>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public Task<PracticeSettingsGetRow> GetSettings(Guid practice, CancellationToken ct) =>
        settings.SettingsGetAsync(practice, ct);

    [HttpPatch("{practice:guid}/settings")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> UpdateSettings(
        Guid practice,
        [FromBody] UpdatePracticeSettingsRequest body,
        CancellationToken ct)
    {
        await settings.SettingsUpdateAsync(
            practice, body.Name, body.Timezone, body.MinNoticeMinutes, body.CancellationNoticeHours, ct);

        // The practice name and its notice windows both appear on the public profile.
        await cacheInvalidator.EvictFacetsAsync(BrandSlug(), ct);
        return NoContent();
    }

    [HttpGet("{practice:guid}/locations")]
    [ProducesResponseType<IReadOnlyList<PracticeLocationsListRow>>(StatusCodes.Status200OK)]
    public Task<IReadOnlyList<PracticeLocationsListRow>> ListLocations(
        Guid practice,
        CancellationToken ct) =>
        settings.LocationsListAsync(practice, ct);

    /// <summary>
    /// Create or update a location. <c>200</c> with the identifier, not <c>201</c>: one procedure
    /// serves both and the caller cannot tell which happened.
    /// </summary>
    [HttpPut("{practice:guid}/locations")]
    [ProducesResponseType<PracticeIdResponse>(StatusCodes.Status200OK)]
    public async Task<ActionResult<PracticeIdResponse>> UpsertLocation(
        Guid practice,
        [FromBody] UpsertLocationRequest body,
        CancellationToken ct)
    {
        var id = await settings.LocationUpsertAsync(
            practice, body.LocationId, body.Name, body.Address, body.CityId, body.IsPrimary, ct);

        // A location carries the city, which is a directory facet.
        await cacheInvalidator.EvictFacetsAsync(BrandSlug(), ct);
        return Ok(new PracticeIdResponse(id));
    }

    [HttpDelete("{practice:guid}/locations/{id:guid}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> RemoveLocation(Guid practice, Guid id, CancellationToken ct)
    {
        await settings.LocationRemoveAsync(practice, id, ct);
        await cacheInvalidator.EvictFacetsAsync(BrandSlug(), ct);
        return NoContent();
    }

    private string BrandSlug() => BrandKeys.GetResolvedBrand(HttpContext)?.Slug ?? string.Empty;
}
