using System.ComponentModel.DataAnnotations;
using BabyBlue.Api.Caching;
using BabyBlue.Api.Middleware;
using BabyBlue.Api.RateLimiting;
using BabyBlue.Contracts.Platform;
using BabyBlue.Data.Generated;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace BabyBlue.Api.Controllers;

/// <summary>
/// Platform administration: the verification queue, the audit log, and the three decisions only
/// BabyBlue itself may make.
///
/// There is deliberately no <c>[Authorize(Roles = "platform_admin")]</c>. The authority is
/// <c>is_platform_admin()</c> inside each procedure, reading <c>public.platform_roles</c>, and an
/// attribute here would be a second gate keyed on a JWT claim the database does not consult — so
/// the two could disagree, and the attribute would be the one an attacker can influence. A
/// non-admin reaching these routes gets <c>42501</c> from PostgreSQL, which maps to <c>403</c>.
///
/// <c>platform_my_role</c>, the sixth <c>platform_*</c> procedure, is routed as
/// <c>GET /v1/me/platform-role</c> on <c>PracticeContextController</c> (F-04): every signed-in
/// user may ask what their own role is, so it does not belong behind an admin-only surface.
/// </summary>
[ApiController]
[Route("v1/platform")]
[Authorize]
[EnableRateLimiting(Policies.AuthenticatedPerUser)]
public sealed class PlatformController(
    PlatformProcedures platform,
    IPublicReadCacheInvalidator cacheInvalidator) : ControllerBase
{
    [HttpGet("overview")]
    [ProducesResponseType<IReadOnlyList<PlatformOverviewRow>>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public Task<IReadOnlyList<PlatformOverviewRow>> GetOverview(CancellationToken ct) =>
        platform.OverviewAsync(ct);

    /// <summary>
    /// The audit log, paginated by keyset rather than by offset.
    ///
    /// <c>before</c> is the oldest <c>at</c> already seen, so the next page is a range scan on an
    /// index instead of a scan that re-reads and discards everything above the offset. On an
    /// append-only log that only grows, offset paging gets slower with every entry written and
    /// can also skip or repeat rows when entries arrive mid-pagination; keyset does neither.
    /// </summary>
    [HttpGet("audit-log")]
    [ProducesResponseType<IReadOnlyList<PlatformAuditLogRow>>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public Task<IReadOnlyList<PlatformAuditLogRow>> GetAuditLog(
        [FromQuery] Guid? practice = null,
        [FromQuery, Range(1, 500)] int limit = 100,
        [FromQuery] DateTimeOffset? before = null,
        CancellationToken ct = default) =>
        platform.AuditLogAsync(practice, limit, before, ct);

    /// <summary>
    /// Grant a platform role by email. <c>user_not_found</c> → <c>409</c>: the person must already
    /// hold an account, because the platform cannot create an identity on their behalf.
    /// </summary>
    [HttpPost("roles")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> GrantRole(
        [FromBody] GrantPlatformRoleRequest body,
        CancellationToken ct)
    {
        await platform.RoleGrantAsync(body.Email, body.Role, ct);
        return NoContent();
    }

    /// <summary>
    /// Suspend, activate or re-pend a practice. The change is appended to
    /// <c>practice_status_events</c> as well as applied, so why a practice was suspended survives
    /// the next status change.
    ///
    /// Suspension removes the practice from the public directory, so the cached facets and
    /// listings have to be evicted or it stays visible for up to an hour.
    /// </summary>
    [HttpPut("practices/{id:guid}/status")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> SetPracticeStatus(
        Guid id,
        [FromBody] SetPracticeStatusRequest body,
        CancellationToken ct)
    {
        await platform.PracticeStatusSetAsync(id, body.Status, body.Reason, ct);
        await cacheInvalidator.EvictFacetsAsync(BrandSlug(), ct);
        return NoContent();
    }

    /// <summary>
    /// Set a practitioner's verification status (D-06). This is the badge the public directory
    /// shows and the one thing a practice can never award itself, which is why the only write
    /// route for it lives here.
    /// </summary>
    [HttpPut("practitioners/{id:guid}/verification")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> SetVerification(
        Guid id,
        [FromBody] SetVerificationRequest body,
        CancellationToken ct)
    {
        await platform.VerificationSetAsync(id, body.Status, body.Note, ct);

        // The badge shows on the cached profile and drives the `verified_only` listing filter.
        await cacheInvalidator.EvictPractitionerAsync(BrandSlug(), id, ct);
        return NoContent();
    }

    private string BrandSlug() => BrandKeys.GetResolvedBrand(HttpContext)?.Slug ?? string.Empty;
}
