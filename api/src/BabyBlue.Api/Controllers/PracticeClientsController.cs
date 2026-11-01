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
/// A practice's clients and their consent record.
///
/// Consent is an append-only event series (POPIA s11(3)): granting appends a grant, withdrawing
/// appends a withdrawal, and neither erases what came before, because the practice has to be able
/// to show what it was permitted to do at the time it acted. That is why withdrawal is a
/// <c>DELETE</c> on the route but an insert in the database, and why the list returns the whole
/// series rather than a current-state flag.
///
/// Which columns a caller sees is decided inside <c>practice_client_get</c> by role, not here.
/// </summary>
[ApiController]
[Route("v1/practices/{practice:guid}/clients")]
[Authorize]
[EnableRateLimiting(Policies.AuthenticatedPerUser)]
public sealed class PracticeClientsController(PracticeClientsProcedures clients) : ControllerBase
{
    [HttpGet]
    [ProducesResponseType<IReadOnlyList<PracticeClientsListRow>>(StatusCodes.Status200OK)]
    public Task<IReadOnlyList<PracticeClientsListRow>> List(
        Guid practice,
        [FromQuery, StringLength(120)] string? q = null,
        [FromQuery, Range(1, 100)] int limit = 50,
        [FromQuery, Range(0, 100_000)] int offset = 0,
        CancellationToken ct = default) =>
        // [Range] is not a duplicate of the procedure's clamp: it refuses an absurd value with a
        // 400 instead of silently clamping, which is better feedback. The clamp is the authority.
        clients.ClientsListAsync(practice, q, limit, offset, ct);

    /// <summary>
    /// Typeahead. A separate route from <c>List</c> with its own limiter, because it is called on
    /// every keystroke and must not be able to exhaust the caller's general 120/min budget.
    /// </summary>
    [HttpGet("search")]
    [EnableRateLimiting(Policies.ClientTypeahead)]
    [ProducesResponseType<IReadOnlyList<PracticeClientSearchRow>>(StatusCodes.Status200OK)]
    public Task<IReadOnlyList<PracticeClientSearchRow>> Search(
        Guid practice,
        [FromQuery, StringLength(120)] string? q = null,
        [FromQuery, Range(1, 20)] int limit = 6,
        CancellationToken ct = default) =>
        clients.ClientSearchAsync(practice, q, limit, ct);

    [HttpGet("{id:guid}")]
    [ProducesResponseType<PracticeClientGetRow>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public Task<PracticeClientGetRow> Get(Guid practice, Guid id, CancellationToken ct) =>
        clients.ClientGetAsync(practice, id, ct);

    [HttpPost]
    [ProducesResponseType<PracticeIdResponse>(StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<PracticeIdResponse>> Create(
        Guid practice,
        [FromBody] CreateClientRequest body,
        CancellationToken ct)
    {
        var id = await clients.ClientCreateAsync(
            practice,
            body.FirstName,
            body.LastName,
            body.Phone,
            body.Email,
            body.ConsentRecordStorage,
            ct);

        return Created($"/v1/practices/{practice}/clients/{id}", new PracticeIdResponse(id));
    }

    [HttpPatch("{id:guid}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> Update(
        Guid practice,
        Guid id,
        [FromBody] UpdateClientRequest body,
        CancellationToken ct)
    {
        await clients.ClientUpdateAsync(
            practice, id, body.FirstName, body.LastName, body.Phone, body.Email, ct);
        return NoContent();
    }

    [HttpPut("{id:guid}/notes")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> SetNotes(
        Guid practice,
        Guid id,
        [FromBody] SetClientNotesRequest body,
        CancellationToken ct)
    {
        await clients.ClientNotesSetAsync(practice, id, body.Notes, ct);
        return NoContent();
    }

    /// <summary>The full event series, oldest first, including withdrawals.</summary>
    [HttpGet("{id:guid}/consents")]
    [ProducesResponseType<IReadOnlyList<PracticeClientConsentsListRow>>(StatusCodes.Status200OK)]
    public Task<IReadOnlyList<PracticeClientConsentsListRow>> ListConsents(
        Guid practice,
        Guid id,
        CancellationToken ct) =>
        clients.ClientConsentsListAsync(practice, id, ct);

    [HttpPost("{id:guid}/consents")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> GrantConsent(
        Guid practice,
        Guid id,
        [FromBody] GrantConsentRequest body,
        CancellationToken ct)
    {
        if (body.Evidence is { } evidence && EvidenceTooLarge(evidence))
        {
            return ApiProblems.InvalidArgument(
                HttpContext,
                $"evidence must not exceed {GrantConsentRequest.MaxEvidenceBytes} bytes.");
        }

        await clients.ClientConsentGrantAsync(practice, id, body.Purpose, body.Evidence, ct);
        return NoContent();
    }

    /// <summary>
    /// Withdraw a consent. <c>DELETE</c> describes what the caller is asking for; the database
    /// appends a withdrawal event and keeps the original grant, so the series still shows what
    /// the practice was permitted to do before this moment.
    ///
    /// <c>reason</c> is a query parameter rather than a body because a <c>DELETE</c> body is
    /// poorly supported by intermediaries and some clients drop it.
    /// </summary>
    [HttpDelete("{id:guid}/consents/{purpose}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> WithdrawConsent(
        Guid practice,
        Guid id,
        [FromRoute, AllowedValues("record_storage", "appointment_reminders", "marketing")] string purpose,
        [FromQuery, StringLength(240)] string? reason = null,
        CancellationToken ct = default)
    {
        await clients.ClientConsentWithdrawAsync(practice, id, purpose, reason, ct);
        return NoContent();
    }

    /// <summary>
    /// Keeps a <c>jsonb</c> column from being used as general storage. Measured on the compact
    /// serialisation, so formatting whitespace cannot be used to inflate or evade the limit.
    /// </summary>
    private static bool EvidenceTooLarge(JsonElement evidence)
    {
        var bytes = JsonSerializer.SerializeToUtf8Bytes(evidence);
        return bytes.Length > GrantConsentRequest.MaxEvidenceBytes;
    }
}
