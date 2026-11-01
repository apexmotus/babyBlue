using BabyBlue.Api.Caching;
using BabyBlue.Api.RateLimiting;
using BabyBlue.Contracts.Practice;
using BabyBlue.Data.Generated;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace BabyBlue.Api.Controllers;

/// <summary>
/// Practitioners, their council registrations and verification history, and practice membership.
///
/// Two refusals here are the point of the controller rather than incidental to it:
/// <c>sole_owner</c> on the last owner's demotion or removal, and <c>registration_in_use</c> on a
/// council number already claimed. Both are raised by the procedure and surface as <c>409</c>;
/// neither is re-checked here, because a second copy of the rule is a second thing to get wrong.
/// </summary>
[ApiController]
[Route("v1/practices/{practice:guid}")]
[Authorize]
[EnableRateLimiting(Policies.AuthenticatedPerUser)]
public sealed class PracticeTeamController(
    PracticeTeamProcedures team,
    IPublicReadCacheInvalidator cacheInvalidator) : ControllerBase
{
    // ------------------------------------------------------------------ practitioners

    [HttpGet("practitioners")]
    [ProducesResponseType<IReadOnlyList<PracticePractitionersListRow>>(StatusCodes.Status200OK)]
    public Task<IReadOnlyList<PracticePractitionersListRow>> ListPractitioners(
        Guid practice,
        CancellationToken ct) =>
        team.PractitionersListAsync(practice, ct);

    [HttpPost("practitioners")]
    [ProducesResponseType<PracticeIdResponse>(StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<ActionResult<PracticeIdResponse>> CreatePractitioner(
        Guid practice,
        [FromBody] CreatePractitionerRequest body,
        CancellationToken ct)
    {
        var id = await team.PractitionerCreateAsync(
            practice,
            body.DisplayName,
            body.Title,
            body.SpecialitySlug,
            body.Bio,
            body.Languages,
            body.UserId,
            ct);

        // A new practitioner changes who the public directory lists and the speciality counts.
        await cacheInvalidator.EvictFacetsAsync(BrandSlug(), ct);

        return Created($"/v1/practices/{practice}/practitioners/{id}", new PracticeIdResponse(id));
    }

    [HttpPatch("practitioners/{id:guid}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> UpdatePractitioner(
        Guid practice,
        Guid id,
        [FromBody] UpdatePractitionerRequest body,
        CancellationToken ct)
    {
        await team.PractitionerUpdateAsync(
            practice,
            id,
            body.DisplayName,
            body.Title,
            body.SpecialitySlug,
            body.Bio,
            body.Languages,
            body.ListingStatus,
            ct);

        // The public profile is cached for 5 minutes and the facets for an hour, so an edit that
        // is not evicted stays invisible for that long. Listing status and speciality both move
        // the facet counts, which is why this evicts the practitioner and the facets.
        await cacheInvalidator.EvictPractitionerAsync(BrandSlug(), id, ct);

        return NoContent();
    }

    [HttpGet("practitioners/{id:guid}/services")]
    [ProducesResponseType<IReadOnlyList<PracticePractitionerServicesListRow>>(StatusCodes.Status200OK)]
    public Task<IReadOnlyList<PracticePractitionerServicesListRow>> ListPractitionerServices(
        Guid practice,
        Guid id,
        CancellationToken ct) =>
        team.PractitionerServicesListAsync(practice, id, ct);

    [HttpPut("practitioners/{id:guid}/services")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> SetPractitionerServices(
        Guid practice,
        Guid id,
        [FromBody] SetPractitionerServicesRequest body,
        CancellationToken ct)
    {
        // Passed as a native uuid[] by Npgsql (§15), not serialised into a string.
        await team.PractitionerServicesSetAsync(practice, id, body.ServiceIds, ct);
        await cacheInvalidator.EvictPractitionerAsync(BrandSlug(), id, ct);
        return NoContent();
    }

    // ------------------------------------------------------------------ registrations

    [HttpGet("practitioners/{id:guid}/registrations")]
    [ProducesResponseType<IReadOnlyList<PracticeRegistrationsListRow>>(StatusCodes.Status200OK)]
    public Task<IReadOnlyList<PracticeRegistrationsListRow>> ListRegistrations(
        Guid practice,
        Guid id,
        CancellationToken ct) =>
        team.RegistrationsListAsync(practice, id, ct);

    /// <summary>
    /// Submit a council registration. <c>practice_registration_submit</c> returns <c>void</c>, so
    /// this is <c>204</c> and not the <c>201</c> the plan's table suggested — there is no
    /// identifier to hand back or to put in a <c>Location</c>.
    /// </summary>
    [HttpPost("practitioners/{id:guid}/registrations")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> SubmitRegistration(
        Guid practice,
        Guid id,
        [FromBody] SubmitRegistrationRequest body,
        CancellationToken ct)
    {
        await team.RegistrationSubmitAsync(practice, id, body.BodyCode, body.Number, ct);
        return NoContent();
    }

    /// <summary>
    /// Verification history, append-only. A practice reads its own decisions; it cannot make them
    /// — verification is platform-side (D-06), which is why there is no write route here.
    /// </summary>
    [HttpGet("practitioners/{id:guid}/verifications")]
    [ProducesResponseType<IReadOnlyList<PracticeVerificationsListRow>>(StatusCodes.Status200OK)]
    public Task<IReadOnlyList<PracticeVerificationsListRow>> ListVerifications(
        Guid practice,
        Guid id,
        CancellationToken ct) =>
        team.VerificationsListAsync(practice, id, ct);

    // ------------------------------------------------------------------ members

    [HttpGet("members")]
    [ProducesResponseType<IReadOnlyList<PracticeTeamListRow>>(StatusCodes.Status200OK)]
    public Task<IReadOnlyList<PracticeTeamListRow>> ListMembers(Guid practice, CancellationToken ct) =>
        team.TeamListAsync(practice, ct);

    /// <summary>
    /// Add a member by email. <c>user_not_found</c> → <c>409</c> when nobody holds that address:
    /// the person has to sign up first, because the practice cannot create an identity for them.
    /// </summary>
    [HttpPost("members")]
    [ProducesResponseType<PracticeIdResponse>(StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<PracticeIdResponse>> AddMember(
        Guid practice,
        [FromBody] AddMemberRequest body,
        CancellationToken ct)
    {
        var userId = await team.MemberAddAsync(practice, body.Email, body.Role, ct);
        return Created($"/v1/practices/{practice}/members/{userId}", new PracticeIdResponse(userId));
    }

    /// <summary>
    /// Change a member's role.
    ///
    /// This route exists to close the Stage 0 bug where the Practice OS wrote
    /// <c>update practice_members set role</c> straight from the browser, which let the only owner
    /// demote themselves and leave the practice with nobody who could administer it.
    /// <c>practice_member_role_set</c> raises <c>sole_owner</c> instead, and it arrives here as
    /// <c>409</c>.
    /// </summary>
    [HttpPut("members/{userId:guid}/role")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> SetMemberRole(
        Guid practice,
        Guid userId,
        [FromBody] SetMemberRoleRequest body,
        CancellationToken ct)
    {
        await team.MemberRoleSetAsync(practice, userId, body.Role, ct);
        return NoContent();
    }

    [HttpDelete("members/{userId:guid}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> RemoveMember(Guid practice, Guid userId, CancellationToken ct)
    {
        await team.MemberRemoveAsync(practice, userId, ct);
        return NoContent();
    }

    private string BrandSlug() => Middleware.BrandKeys.GetResolvedBrand(HttpContext)?.Slug ?? string.Empty;
}
