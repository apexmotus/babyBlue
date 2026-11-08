using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using BabyBlue.Api.RateLimiting;
using BabyBlue.Contracts.Patient;
using BabyBlue.Data.Generated;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace BabyBlue.Api.Controllers;

[ApiController]
[Route("v1/me")]
[Authorize]
[EnableRateLimiting(Policies.AuthenticatedPerUser)]
public sealed class PatientController(PatientProcedures patientProcedures) : ControllerBase
{
    [HttpGet("profile")]
    public Task<PatientProfileGetRow> GetProfile(CancellationToken ct = default) =>
        patientProcedures.ProfileGetAsync(ct);

    [HttpPatch("profile")]
    public async Task<IActionResult> UpdateProfile(
        [FromBody] UpdateProfileRequest body,
        CancellationToken ct = default)
    {
        await patientProcedures.ProfileUpdateAsync(body.DisplayName, body.Phone, ct);
        return NoContent();
    }

    /// <summary>
    /// The caller's appointments.
    ///
    /// <c>patient_appointments_list(p_scope)</c> takes no limit or offset, and an unvalidated
    /// scope falls through its <c>case</c> to <c>else true</c> — so an unrecognised value used
    /// to return everything silently instead of refusing. <c>[AllowedValues]</c> makes the
    /// three real scopes the only ones that reach the database, and the earlier C# paging is
    /// gone: it clipped rows after fetching them all, which neither bounded the query nor
    /// matched the §8 rule that route parameters mirror procedure arguments.
    /// </summary>
    [HttpGet("appointments")]
    [ProducesResponseType<IReadOnlyList<PatientAppointmentsListRow>>(StatusCodes.Status200OK)]
    public async Task<ActionResult<IReadOnlyList<PatientAppointmentsListRow>>> ListAppointments(
        [FromQuery, AllowedValues(null, "all", "upcoming", "past")] string? scope = null,
        [FromQuery(Name = "upcoming_only")] bool upcomingOnly = false,
        CancellationToken ct = default)
    {
        var resolvedScope = !string.IsNullOrWhiteSpace(scope)
            ? scope
            : upcomingOnly ? "upcoming" : "all";

        return Ok(await patientProcedures.AppointmentsListAsync(resolvedScope, ct));
    }

    [HttpGet("appointments/{id:guid}")]
    public Task<PatientAppointmentGetRow> GetAppointment(
        [FromRoute] Guid id,
        CancellationToken ct = default) =>
        patientProcedures.AppointmentGetAsync(id, ct);

    [HttpPost("holds")]
    [EnableRateLimiting(Policies.SlotHold)]
    public async Task<ActionResult<CreatedIdResponse>> CreateHold(
        [FromBody] CreateSlotHoldRequest body,
        CancellationToken ct = default)
    {
        var holdId = await patientProcedures.SlotHoldAsync(
            body.PractitionerId,
            body.ServiceId,
            body.StartsAt,
            ct);

        return Created($"/v1/me/holds/{holdId}", new CreatedIdResponse(holdId));
    }

    [HttpGet("holds/{id:guid}")]
    public Task<PatientHoldGetRow> GetHold(
        [FromRoute] Guid id,
        CancellationToken ct = default) =>
        patientProcedures.HoldGetAsync(id, ct);

    [HttpDelete("holds/{id:guid}")]
    public async Task<IActionResult> ReleaseHold(
        [FromRoute] Guid id,
        CancellationToken ct = default)
    {
        await patientProcedures.HoldReleaseAsync(id, ct);
        return NoContent();
    }

    [HttpPost("appointments")]
    public async Task<ActionResult<CreatedIdResponse>> BookAppointment(
        [FromBody] BookAppointmentRequest body,
        CancellationToken ct = default)
    {
        var apptId = await patientProcedures.AppointmentBookAsync(body.HoldId, ct);
        return Created($"/v1/me/appointments/{apptId}", new CreatedIdResponse(apptId));
    }

    [HttpPost("appointments/{id:guid}/cancel")]
    public async Task<IActionResult> CancelAppointment(
        [FromRoute] Guid id,
        [FromBody] CancelAppointmentRequest? body = null,
        CancellationToken ct = default)
    {
        await patientProcedures.AppointmentCancelAsync(id, body?.Reason, ct);
        return NoContent();
    }

    [HttpPost("appointments/{id:guid}/reschedule")]
    public async Task<IActionResult> RescheduleAppointment(
        [FromRoute] Guid id,
        [FromBody] RescheduleAppointmentRequest body,
        CancellationToken ct = default)
    {
        await patientProcedures.AppointmentRescheduleAsync(id, body.NewStartsAt, ct);
        return NoContent();
    }

    [HttpPost("appointments/{id:guid}/check-in")]
    public async Task<IActionResult> CheckInAppointment(
        [FromRoute] Guid id,
        CancellationToken ct = default)
    {
        await patientProcedures.AppointmentCheckInAsync(id, ct);
        return NoContent();
    }

    [HttpGet("export")]
    public async Task<ActionResult<JsonElement>> ExportAccount(CancellationToken ct = default)
    {
        var exportJson = await patientProcedures.AccountExportAsync(ct);
        Response.Headers.ContentDisposition = "attachment; filename=\"babyblue-export.json\"";
        Response.Headers.CacheControl = "no-store";
        return Ok(exportJson);
    }

    [HttpDelete]
    public async Task<IActionResult> DeleteAccount(CancellationToken ct = default)
    {
        await patientProcedures.AccountDeleteAsync(ct);
        return NoContent();
    }
}
