using System.ComponentModel.DataAnnotations;
using BabyBlue.Api.Middleware;
using BabyBlue.Api.RateLimiting;
using BabyBlue.Contracts.Generated;
using BabyBlue.Contracts.Practice;
using BabyBlue.Data.Generated;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace BabyBlue.Api.Controllers;

/// <summary>
/// Staff-side appointments: booking for a client, moving one, cancelling one, and the slot finder.
///
/// Staff are not patients and the rules differ. Cancellation here is not bound by the patient's
/// cancellation window — reception has to be able to cancel a tomorrow-morning appointment the
/// patient telephoned about. The window is a patient-facing rule, enforced in
/// <c>patient_appointment_cancel</c>, and its absence here is intentional rather than an omission.
///
/// Creation is the one place <c>consent_required</c> is raised (F-10): the procedure reads the
/// latest <c>client_consents</c> event for <c>record_storage</c> and refuses when it is absent or
/// withdrawn. That is the POPIA s11 check staff booking must not be able to skip, which is why it
/// lives in the procedure and not in a form validator.
/// </summary>
[ApiController]
[Route("v1/practices/{practice:guid}/appointments")]
[Authorize]
[EnableRateLimiting(Policies.AuthenticatedPerUser)]
public sealed class PracticeAppointmentsController(
    PracticeAppointmentsProcedures appointments) : ControllerBase
{
    /// <summary>Includes <c>source</c>, which drives the D-22 "via BabyBlue" chip.</summary>
    [HttpGet("{id:guid}")]
    [ProducesResponseType<PracticeAppointmentGetRow>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public Task<PracticeAppointmentGetRow> Get(Guid practice, Guid id, CancellationToken ct) =>
        appointments.AppointmentGetAsync(practice, id, ct);

    [HttpGet("{id:guid}/history")]
    [ProducesResponseType<IReadOnlyList<PracticeAppointmentHistoryRow>>(StatusCodes.Status200OK)]
    public Task<IReadOnlyList<PracticeAppointmentHistoryRow>> GetHistory(
        Guid practice,
        Guid id,
        CancellationToken ct) =>
        appointments.AppointmentHistoryAsync(practice, id, ct);

    /// <summary>
    /// Book for a client. Three refusals, all from the procedure: <c>slot_unavailable</c>
    /// (<c>23P01</c> from the <c>no_double_booking</c> exclusion constraint) → <c>409</c>,
    /// <c>consent_required</c> → <c>409</c>, <c>not_found</c> → <c>404</c>.
    /// </summary>
    [HttpPost]
    [ProducesResponseType<PracticeIdResponse>(StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<PracticeIdResponse>> Create(
        Guid practice,
        [FromBody] CreatePracticeAppointmentRequest body,
        CancellationToken ct)
    {
        var id = await appointments.AppointmentCreateAsync(
            practice,
            body.PractitionerId,
            body.ServiceId,
            body.ClientId,
            body.StartsAt,
            body.Source,
            body.LocationId,
            ct);

        return Created($"/v1/practices/{practice}/appointments/{id}", new PracticeIdResponse(id));
    }

    /// <summary>
    /// Set a status. The allowed values come from <c>pg_enum</c> via <c>PgEnums</c>, so adding a
    /// label to <c>appointment_status</c> cannot leave a hand-typed list behind. Which transitions
    /// are legal is still the procedure's to decide, and an illegal one is
    /// <c>409 invalid_transition</c>.
    /// </summary>
    [HttpPut("{id:guid}/status")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> SetStatus(
        Guid practice,
        Guid id,
        [FromBody] SetAppointmentStatusRequest body,
        CancellationToken ct)
    {
        if (!PgEnums.AppointmentStatus.Contains(body.Status, StringComparer.Ordinal))
        {
            return ApiProblems.InvalidArgument(
                HttpContext,
                $"status must be one of: {string.Join(", ", PgEnums.AppointmentStatus)}.");
        }

        await appointments.AppointmentStatusSetAsync(practice, id, body.Status, ct);
        return NoContent();
    }

    [HttpPost("{id:guid}/cancel")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Cancel(
        Guid practice,
        Guid id,
        [FromBody] CancelPracticeAppointmentRequest? body = null,
        CancellationToken ct = default)
    {
        await appointments.AppointmentCancelAsync(practice, id, body?.Reason, ct);
        return NoContent();
    }

    [HttpPost("{id:guid}/reschedule")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Reschedule(
        Guid practice,
        Guid id,
        [FromBody] ReschedulePracticeAppointmentRequest body,
        CancellationToken ct)
    {
        await appointments.AppointmentRescheduleAsync(practice, id, body.NewStartsAt, ct);
        return NoContent();
    }

    /// <summary>
    /// Bookable slots for one practitioner, service and day. A single <c>day</c>, not a range:
    /// <c>practice_appointment_slots</c> takes <c>p_day date</c>, and the staff slot finder asks
    /// one day at a time.
    /// </summary>
    [HttpGet("slots")]
    [ProducesResponseType<IReadOnlyList<PracticeAppointmentSlotsRow>>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> GetSlots(
        Guid practice,
        [FromQuery, Required] Guid practitioner,
        [FromQuery, Required] Guid service,
        [FromQuery, Required] DateOnly day,
        CancellationToken ct = default)
    {
        if (practitioner == Guid.Empty || service == Guid.Empty || day == default)
        {
            return ApiProblems.InvalidArgument(
                HttpContext, "practitioner, service and day are all required.");
        }

        return Ok(await appointments.AppointmentSlotsAsync(practice, practitioner, service, day, ct));
    }
}
