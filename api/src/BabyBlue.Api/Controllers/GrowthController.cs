using System.ComponentModel.DataAnnotations;
using System.Text.Json;
using BabyBlue.Api.Filters;
using BabyBlue.Api.Middleware;
using BabyBlue.Api.RateLimiting;
using BabyBlue.Contracts.Generated;
using BabyBlue.Contracts.Growth;
using BabyBlue.Data.Generated;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace BabyBlue.Api.Controllers;

/// <summary>
/// Growth: a practice commissions marketing work, a marketing operator delivers it, and the two
/// sides see different things.
///
/// Two structural points, both from §8 and §14:
///
/// <para><b>Why most routes are not nested under a practice.</b> Only listing and creating a
/// request are, because only those two take <c>p_practice</c>. The other fourteen take a request
/// id, and <c>_require_request_access</c> resolves the practice from it — which it must, because a
/// <c>marketing_operator</c> is authorised on a request without being a member of the practice
/// that owns it. Nesting them under <c>/v1/practices/{p}</c> would imply a membership check that
/// is deliberately not the rule here.</para>
///
/// <para><b>Why a brand without Growth gets 404 and not 403.</b> A tenant that has not licensed
/// Growth should not learn that Growth exists. <c>RequireBrandFeature</c> answers <c>404</c>, so
/// the feature is not discoverable rather than merely closed.</para>
/// </summary>
[ApiController]
[Authorize]
[EnableRateLimiting(Policies.AuthenticatedPerUser)]
[RequireBrandFeature("growth", DefaultEnabled = false)]
public sealed class GrowthController(GrowthProcedures growth) : ControllerBase
{
    /// <summary>
    /// The database refuses anything over 5 MiB on the real payload
    /// (<c>octet_length(p_content)</c>). One extra byte is read so an oversized upload can be
    /// detected and refused without materialising the whole thing.
    /// </summary>
    private const int MaxAssetBytes = 5 * 1024 * 1024;

    private const int MaxMultipartBytes = 6 * 1024 * 1024;

    /// <summary>
    /// Media types served back with their own <c>Content-Type</c>. Anything else is downgraded to
    /// <c>application/octet-stream</c>, so an uploaded <c>text/html</c> or SVG cannot be served as
    /// itself and run script on the API origin. Combined with <c>nosniff</c> and an
    /// <c>attachment</c> disposition, that is three independent reasons a stored asset cannot
    /// execute in a viewer's browser.
    /// </summary>
    private static readonly HashSet<string> AllowedAssetMimes = new(StringComparer.OrdinalIgnoreCase)
    {
        "image/png", "image/jpeg", "image/gif", "image/webp",
        "application/pdf",
        "text/plain", "text/csv",
        "application/zip",
        "video/mp4",
    };

    // ------------------------------------------------------------------ catalogue & requests

    [HttpGet("v1/growth/services")]
    [ProducesResponseType<IReadOnlyList<GrowthServicesListRow>>(StatusCodes.Status200OK)]
    public Task<IReadOnlyList<GrowthServicesListRow>> ListServices(CancellationToken ct) =>
        growth.ServicesListAsync(ct);

    [HttpGet("v1/practices/{practice:guid}/growth/requests")]
    [ProducesResponseType<IReadOnlyList<GrowthRequestsListRow>>(StatusCodes.Status200OK)]
    public Task<IReadOnlyList<GrowthRequestsListRow>> ListRequests(Guid practice, CancellationToken ct) =>
        growth.RequestsListAsync(practice, ct);

    [HttpPost("v1/practices/{practice:guid}/growth/requests")]
    [ProducesResponseType<GrowthIdResponse>(StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<GrowthIdResponse>> CreateRequest(
        Guid practice,
        [FromBody] CreateGrowthRequestRequest body,
        CancellationToken ct)
    {
        if (!body.BudgetIsOrdered())
        {
            return ApiProblems.InvalidRange(
                HttpContext, "budget_max_cents must not be below budget_min_cents.");
        }

        var id = await growth.RequestCreateAsync(
            practice,
            body.ServiceId,
            body.Title,
            body.Brief,
            body.BudgetMinCents,
            body.BudgetMaxCents,
            body.Deadline,
            ct);

        return Created($"/v1/growth/requests/{id}", new GrowthIdResponse(id));
    }

    [HttpGet("v1/growth/requests/{id:guid}")]
    [ProducesResponseType<GrowthRequestGetRow>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public Task<GrowthRequestGetRow> GetRequest(Guid id, CancellationToken ct) =>
        growth.RequestGetAsync(id, ct);

    /// <summary>
    /// Advance a request through its lifecycle. The procedure holds an eight-way state machine
    /// that also decides <em>which side</em> may make each move — a practice submits, an operator
    /// reviews, the practice approves the proposal, the operator delivers. An illegal move, or a
    /// legal move attempted by the wrong party, is <c>409 invalid_transition</c>.
    /// </summary>
    [HttpPut("v1/growth/requests/{id:guid}/status")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> SetRequestStatus(
        Guid id,
        [FromBody] SetGrowthStatusRequest body,
        CancellationToken ct)
    {
        if (!PgEnums.MarketingStatus.Contains(body.Status, StringComparer.Ordinal))
        {
            return ApiProblems.InvalidArgument(
                HttpContext, $"status must be one of: {string.Join(", ", PgEnums.MarketingStatus)}.");
        }

        await growth.RequestStatusSetAsync(id, body.Status, ct);
        return NoContent();
    }

    // ------------------------------------------------------------------ updates

    [HttpGet("v1/growth/requests/{id:guid}/updates")]
    [ProducesResponseType<IReadOnlyList<GrowthUpdatesListRow>>(StatusCodes.Status200OK)]
    public Task<IReadOnlyList<GrowthUpdatesListRow>> ListUpdates(Guid id, CancellationToken ct) =>
        growth.UpdatesListAsync(id, ct);

    [HttpPost("v1/growth/requests/{id:guid}/updates")]
    [ProducesResponseType<GrowthIdResponse>(StatusCodes.Status201Created)]
    public async Task<ActionResult<GrowthIdResponse>> PostUpdate(
        Guid id,
        [FromBody] PostGrowthUpdateRequest body,
        CancellationToken ct)
    {
        var updateId = await growth.UpdatePostAsync(id, body.Body, ct);
        return Created($"/v1/growth/requests/{id}/updates/{updateId}", new GrowthIdResponse(updateId));
    }

    // ------------------------------------------------------------------ approvals

    [HttpGet("v1/growth/requests/{id:guid}/approvals")]
    [ProducesResponseType<IReadOnlyList<GrowthApprovalsListRow>>(StatusCodes.Status200OK)]
    public Task<IReadOnlyList<GrowthApprovalsListRow>> ListApprovals(Guid id, CancellationToken ct) =>
        growth.ApprovalsListAsync(id, ct);

    [HttpPost("v1/growth/requests/{id:guid}/approvals")]
    [ProducesResponseType<GrowthIdResponse>(StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<ActionResult<GrowthIdResponse>> AddApproval(
        Guid id,
        [FromBody] AddGrowthApprovalRequest body,
        CancellationToken ct)
    {
        var approvalId = await growth.ApprovalAddAsync(id, body.Item, ct);
        return Created($"/v1/growth/approvals/{approvalId}", new GrowthIdResponse(approvalId));
    }

    /// <summary>
    /// Decide an approval. Routed on the approval alone, not nested under its request:
    /// <c>growth_approval_decide</c> takes only <c>p_approval</c> and resolves the request and
    /// practice from it, so a request id in the path would be a parameter nothing reads — and a
    /// path segment that is never validated is one a caller can be wrong about silently.
    /// </summary>
    [HttpPost("v1/growth/approvals/{approvalId:guid}/decide")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> DecideApproval(
        Guid approvalId,
        [FromBody] DecideGrowthApprovalRequest body,
        CancellationToken ct)
    {
        await growth.ApprovalDecideAsync(approvalId, body.Status, body.Comment, ct);
        return NoContent();
    }

    // ------------------------------------------------------------------ assets

    /// <summary>Metadata only. The <c>bytea</c> column is never part of a list response.</summary>
    [HttpGet("v1/growth/requests/{id:guid}/assets")]
    [ProducesResponseType<IReadOnlyList<GrowthAssetsListRow>>(StatusCodes.Status200OK)]
    public Task<IReadOnlyList<GrowthAssetsListRow>> ListAssets(Guid id, CancellationToken ct) =>
        growth.AssetsListAsync(id, ct);

    /// <summary>
    /// Upload an asset.
    ///
    /// <c>size_bytes</c> is computed from the bytes actually read, never from
    /// <c>IFormFile.Length</c> or any client field (F-13). The earlier draft guarded on a
    /// caller-supplied length, so understating it bypassed the limit entirely; the database now
    /// guards on <c>octet_length(p_content)</c> and this passes the measured count so the two
    /// agree. Only the database check is evidence, which is why the oversize test asserts
    /// through the procedure rather than through this method.
    ///
    /// Who may upload what is the procedure's: a practice owner may add a <c>brief_asset</c>, a
    /// <c>marketing_operator</c> may add a <c>deliverable</c>, and the other combinations are
    /// <c>403</c>.
    /// </summary>
    [HttpPost("v1/growth/requests/{id:guid}/assets")]
    [RequestSizeLimit(MaxMultipartBytes)]
    [ProducesResponseType<GrowthIdResponse>(StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status413PayloadTooLarge)]
    public async Task<IActionResult> AddAsset(
        Guid id,
        [FromForm] IFormFile? file,
        [FromForm, Required, AllowedValues("brief_asset", "deliverable")] string kind = "",
        CancellationToken ct = default)
    {
        if (file is null || file.Length == 0)
        {
            return ApiProblems.InvalidArgument(HttpContext, "A non-empty 'file' part is required.");
        }

        var content = await ReadCappedAsync(file, ct);
        if (content is null)
        {
            // Refused before the whole body was buffered, so an oversized upload cannot be used
            // to exhaust memory on the way to being rejected.
            return ApiProblems.Problem(
                HttpContext, "asset_too_large", StatusCodes.Status413PayloadTooLarge,
                $"The asset must not exceed {MaxAssetBytes} bytes.");
        }

        var assetId = await growth.AssetAddAsync(
            id,
            kind,
            Path.GetFileName(file.FileName),
            file.ContentType,
            content.Length,
            content,
            ct);

        return Created($"/v1/growth/assets/{assetId}/content", new GrowthIdResponse(assetId));
    }

    /// <summary>
    /// Download an asset's bytes.
    ///
    /// These headers are the whole point of the route. An asset is arbitrary content uploaded by
    /// one tenant and downloaded by another on a shared API origin, so it is served as an
    /// attachment, with sniffing off, with an allowlisted media type, and never cached:
    /// <c>Content-Disposition: inline</c> here would be a stored-XSS vector on
    /// <c>api.babyblue.co.za</c>.
    /// </summary>
    [HttpGet("v1/growth/assets/{id:guid}/content")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> DownloadAsset(Guid id, CancellationToken ct)
    {
        var asset = await growth.AssetDownloadAsync(id, ct);

        Response.Headers.XContentTypeOptions = "nosniff";
        Response.Headers.CacheControl = "no-store";

        var declaredMime = asset.Mime ?? string.Empty;
        var safeMime = AllowedAssetMimes.Contains(declaredMime)
            ? declaredMime
            : "application/octet-stream";

        // Path.GetFileName strips any directory traversal a stored filename might carry.
        var fileName = Path.GetFileName(asset.FileName);
        if (string.IsNullOrWhiteSpace(fileName))
        {
            fileName = $"asset-{id:N}";
        }

        return File(asset.Content, safeMime, fileDownloadName: fileName);
    }

    // ------------------------------------------------------------------ reports & inbox

    [HttpGet("v1/growth/requests/{id:guid}/reports")]
    [ProducesResponseType<IReadOnlyList<GrowthReportsListRow>>(StatusCodes.Status200OK)]
    public Task<IReadOnlyList<GrowthReportsListRow>> ListReports(Guid id, CancellationToken ct) =>
        growth.ReportsListAsync(id, ct);

    [HttpPost("v1/growth/requests/{id:guid}/reports")]
    [ProducesResponseType<GrowthIdResponse>(StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<GrowthIdResponse>> CreateReport(
        Guid id,
        [FromBody] CreateGrowthReportRequest body,
        CancellationToken ct)
    {
        if (body.Metrics is { } metrics &&
            JsonSerializer.SerializeToUtf8Bytes(metrics).Length > CreateGrowthReportRequest.MaxMetricsBytes)
        {
            return ApiProblems.InvalidArgument(
                HttpContext, $"metrics must not exceed {CreateGrowthReportRequest.MaxMetricsBytes} bytes.");
        }

        var reportId = await growth.ReportCreateAsync(id, body.Period, body.Summary, body.Metrics, ct);
        return Created($"/v1/growth/requests/{id}/reports/{reportId}", new GrowthIdResponse(reportId));
    }

    /// <summary>
    /// The marketing operator's work queue. <c>403</c> for anyone who is not one, decided by
    /// <c>is_marketing_operator()</c> inside the procedure.
    /// </summary>
    [HttpGet("v1/growth/inbox")]
    [ProducesResponseType<IReadOnlyList<GrowthInboxRow>>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public Task<IReadOnlyList<GrowthInboxRow>> GetInbox(
        [FromQuery, StringLength(32)] string? status = null,
        CancellationToken ct = default) =>
        growth.InboxAsync(status, ct);

    /// <summary>
    /// Reads at most <see cref="MaxAssetBytes"/> + 1 bytes. Returning null means the stream had
    /// more, so the caller can refuse without the rest ever being buffered.
    /// </summary>
    private static async Task<byte[]?> ReadCappedAsync(IFormFile file, CancellationToken ct)
    {
        await using var source = file.OpenReadStream();
        using var buffer = new MemoryStream();

        var chunk = new byte[81_920];
        var total = 0;

        while (true)
        {
            var read = await source.ReadAsync(chunk, ct);
            if (read == 0)
            {
                break;
            }

            total += read;
            if (total > MaxAssetBytes)
            {
                return null;
            }

            await buffer.WriteAsync(chunk.AsMemory(0, read), ct);
        }

        return buffer.ToArray();
    }
}
