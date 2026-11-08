using System.ComponentModel.DataAnnotations;
using BabyBlue.Api.Filters;
using BabyBlue.Api.RateLimiting;
using BabyBlue.Contracts.Practice;
using BabyBlue.Data.Generated;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace BabyBlue.Api.Controllers;

/// <summary>
/// The practice side of Flow: the waiting list, walk-ins, and calling the next patient.
///
/// Gated on the <c>flow</c> brand feature, so a brand that does not license Flow gets <c>404</c>
/// rather than <c>403</c> — a feature a tenant has not bought should not be discoverable.
/// </summary>
[ApiController]
[Route("v1/practices/{practice:guid}/queue")]
[Authorize]
[EnableRateLimiting(Policies.AuthenticatedPerUser)]
[RequireBrandFeature("flow")]
public sealed class PracticeQueueController(PracticeQueueProcedures queue) : ControllerBase
{
    [HttpGet]
    [ProducesResponseType<IReadOnlyList<PracticeQueueListRow>>(StatusCodes.Status200OK)]
    public Task<IReadOnlyList<PracticeQueueListRow>> List(
        Guid practice,
        [FromQuery(Name = "window_hours"), Range(1, 72)] int windowHours = 12,
        CancellationToken ct = default) =>
        queue.QueueListAsync(practice, windowHours, ct);

    [HttpPost("walk-ins")]
    [ProducesResponseType<PracticeIdResponse>(StatusCodes.Status201Created)]
    public async Task<ActionResult<PracticeIdResponse>> AddWalkIn(
        Guid practice,
        [FromBody] AddWalkInRequest body,
        CancellationToken ct)
    {
        var id = await queue.QueueWalkinAddAsync(
            practice, body.Name, body.Phone, body.Urgency, body.ClientId, ct);

        return Created($"/v1/practices/{practice}/queue/{id}", new PracticeIdResponse(id));
    }

    [HttpPut("{id:guid}/status")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> SetStatus(
        Guid practice,
        Guid id,
        [FromBody] SetQueueStatusRequest body,
        CancellationToken ct)
    {
        await queue.QueueStatusSetAsync(practice, id, body.Status, ct);
        return NoContent();
    }

    /// <summary>
    /// Claim the next waiting patient.
    ///
    /// Not idempotent, and that is deliberate: the procedure uses <c>for update skip locked</c> so
    /// two receptionists pressing the button at the same moment get two different patients rather
    /// than both getting the same one. Consequences worth stating, because they are easy to undo
    /// by accident:
    ///
    /// <list type="bullet">
    /// <item>It is never retried. <c>ProcedureGateway</c> retries only <c>stable</c> procedures,
    /// and this one is <c>volatile</c>, so a retry cannot silently claim a second patient.</item>
    /// <item>It is never cached, being a POST.</item>
    /// </list>
    ///
    /// <c>practice_queue_call_next</c> returns a bare <c>uuid</c>, not a row (F-12), so an empty
    /// queue is <c>204</c> and the caller re-reads <c>GET .../queue</c> for the detail.
    /// </summary>
    [HttpPost("call-next")]
    [ProducesResponseType<PracticeIdResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> CallNext(Guid practice, CancellationToken ct)
    {
        var entryId = await queue.QueueCallNextAsync(practice, ct);
        return entryId is { } id ? Ok(new PracticeIdResponse(id)) : NoContent();
    }

    /// <summary>Attach a walk-in entry to an existing client record.</summary>
    [HttpPut("{id:guid}/client")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> LinkClient(
        Guid practice,
        Guid id,
        [FromBody] LinkQueueClientRequest body,
        CancellationToken ct)
    {
        await queue.QueueLinkClientAsync(practice, id, body.ClientId, ct);
        return NoContent();
    }
}
