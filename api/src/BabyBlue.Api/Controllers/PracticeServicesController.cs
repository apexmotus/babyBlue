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
/// Services a practice offers, and which practitioners deliver them.
///
/// Three of the five routes exist to be refused under the right conditions, all three decided in
/// the procedure: <c>price_required</c> when a service is made bookable without a price,
/// <c>last_practitioner</c> when emptying the practitioner set would leave future bookings nobody
/// can deliver, and <c>service_in_use</c> when deactivating a service that still has future
/// appointments (F-10).
/// </summary>
[ApiController]
[Route("v1/practices/{practice:guid}/services")]
[Authorize]
[EnableRateLimiting(Policies.AuthenticatedPerUser)]
public sealed class PracticeServicesController(
    PracticeServicesProcedures services,
    IPublicReadCacheInvalidator cacheInvalidator) : ControllerBase
{
    [HttpGet]
    [ProducesResponseType<IReadOnlyList<PracticeServicesListRow>>(StatusCodes.Status200OK)]
    public Task<IReadOnlyList<PracticeServicesListRow>> List(
        Guid practice,
        [FromQuery(Name = "include_inactive")] bool includeInactive = false,
        CancellationToken ct = default) =>
        services.ServicesListAsync(practice, includeInactive, ct);

    /// <summary>
    /// Create or update a service. <c>200</c> with the identifier rather than <c>201</c>, because
    /// one procedure serves both and the caller cannot tell which happened — an upsert has no
    /// honest <c>Location</c>.
    ///
    /// <c>price_required</c> → <c>400</c> when <c>Active</c> is true and <c>PriceCents</c> is
    /// null. The DTO deliberately does not enforce that pairing: a practice may keep a priced
    /// draft inactive, and the condition under which a price becomes mandatory is the
    /// procedure's to know.
    /// </summary>
    [HttpPut]
    [ProducesResponseType<PracticeIdResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<PracticeIdResponse>> Upsert(
        Guid practice,
        [FromBody] UpsertServiceRequest body,
        CancellationToken ct)
    {
        var id = await services.ServiceUpsertAsync(
            practice,
            body.ServiceId,
            body.Name,
            body.Description,
            body.DurationMin,
            body.BufferMin,
            body.PriceCents,
            body.Active,
            ct);

        // Price and availability both show on the public profile ("from R650").
        await cacheInvalidator.EvictFacetsAsync(BrandSlug(), ct);

        return Ok(new PracticeIdResponse(id));
    }

    [HttpGet("{id:guid}/practitioners")]
    [ProducesResponseType<IReadOnlyList<PracticeServicePractitionersListRow>>(StatusCodes.Status200OK)]
    public Task<IReadOnlyList<PracticeServicePractitionersListRow>> ListPractitioners(
        Guid practice,
        Guid id,
        CancellationToken ct) =>
        services.ServicePractitionersListAsync(practice, id, ct);

    /// <summary>
    /// Replace the set of practitioners who deliver a service. An empty array is a valid request
    /// and is refused with <c>409 last_practitioner</c> only when future <c>booked</c> or
    /// <c>confirmed</c> appointments exist for the service.
    /// </summary>
    [HttpPut("{id:guid}/practitioners")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> SetPractitioners(
        Guid practice,
        Guid id,
        [FromBody] SetServicePractitionersRequest body,
        CancellationToken ct)
    {
        await services.ServicePractitionersSetAsync(practice, id, body.PractitionerIds, ct);
        await cacheInvalidator.EvictFacetsAsync(BrandSlug(), ct);
        return NoContent();
    }

    /// <summary>
    /// Deactivate a service. <c>POST .../deactivate</c>, not <c>DELETE</c> (§8): the row is kept
    /// because past appointments reference it, so this is a state change and not a removal, and
    /// the route should not claim otherwise.
    /// </summary>
    [HttpPost("{id:guid}/deactivate")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Deactivate(Guid practice, Guid id, CancellationToken ct)
    {
        await services.ServiceDeactivateAsync(practice, id, ct);
        await cacheInvalidator.EvictFacetsAsync(BrandSlug(), ct);
        return NoContent();
    }

    private string BrandSlug() => BrandKeys.GetResolvedBrand(HttpContext)?.Slug ?? string.Empty;
}
