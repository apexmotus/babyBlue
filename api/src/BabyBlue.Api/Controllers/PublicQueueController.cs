using System.ComponentModel.DataAnnotations;
using BabyBlue.Api.Caching;
using BabyBlue.Api.Filters;
using BabyBlue.Api.RateLimiting;
using BabyBlue.Contracts.Public;
using BabyBlue.Data.Generated;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.OutputCaching;
using Microsoft.AspNetCore.RateLimiting;

namespace BabyBlue.Api.Controllers;

[ApiController]
[Route("v1/queue")]
[AllowAnonymous]
[EnableRateLimiting(Policies.PublicPerIp)]
[RequireBrandFeature("flow")]
public sealed class PublicQueueController(PublicProcedures publicProcedures) : ControllerBase
{
    [HttpGet("{slug}")]
    [OutputCache(PolicyName = CachePolicies.QueueInfo)]
    [ProducesResponseType<PublicQueueInfoRow>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public Task<PublicQueueInfoRow> GetQueueInfo(
        [RegularExpression(@"^[a-z0-9-]{2,64}$")] string slug,
        CancellationToken ct) =>
        publicProcedures.QueueInfoAsync(slug, ct);

    [HttpPost("{slug}/join")]
    [EnableRateLimiting(Policies.QueueJoin)]
    [OutputCache(PolicyName = CachePolicies.NoCache)]
    [ResponseCache(NoStore = true)]
    [ProducesResponseType<JoinQueueResponse>(StatusCodes.Status201Created)]
    public async Task<IActionResult> JoinQueue(
        [RegularExpression(@"^[a-z0-9-]{2,64}$")] string slug,
        [FromBody] JoinQueueRequest body,
        CancellationToken ct)
    {
        var token = await publicProcedures.QueueJoinAsync(
            slug,
            body.ResolvedName,
            body.Phone,
            body.Urgency,
            ct);

        return Created($"/v1/queue/tokens/{token}", new JoinQueueResponse(token));
    }

    [HttpGet("tokens/{token}")]
    [RedactAccessLog]
    [OutputCache(PolicyName = CachePolicies.NoCache)]
    [ResponseCache(NoStore = true)]
    [ProducesResponseType<PublicQueueStatusRow>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public Task<PublicQueueStatusRow> GetQueueStatus(
        [RegularExpression(@"^[A-Za-z0-9_-]{8,64}$")] string token,
        CancellationToken ct) =>
        publicProcedures.QueueStatusAsync(token, ct);

    [HttpDelete("tokens/{token}")]
    [RedactAccessLog]
    [OutputCache(PolicyName = CachePolicies.NoCache)]
    [ResponseCache(NoStore = true)]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> LeaveQueue(
        [RegularExpression(@"^[A-Za-z0-9_-]{8,64}$")] string token,
        CancellationToken ct)
    {
        await publicProcedures.QueueLeaveAsync(token, ct);
        return NoContent();
    }
}
