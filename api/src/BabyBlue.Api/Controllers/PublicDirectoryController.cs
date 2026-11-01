using System.ComponentModel.DataAnnotations;
using BabyBlue.Api.Caching;
using BabyBlue.Api.Filters;
using BabyBlue.Api.RateLimiting;
using BabyBlue.Data.Generated;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.OutputCaching;
using Microsoft.AspNetCore.RateLimiting;

namespace BabyBlue.Api.Controllers;

[ApiController]
[Route("v1/directory")]
[AllowAnonymous]
[EnableRateLimiting(Policies.PublicPerIp)]
public sealed class PublicDirectoryController(PublicProcedures publicProcedures) : ControllerBase
{
    [HttpGet("practitioners")]
    [EnableRateLimiting(Policies.DirectorySearch)]
    [OutputCache(PolicyName = CachePolicies.Listing)]
    [RequireBrandFeature("directory")]
    [ProducesResponseType<IReadOnlyList<PublicPractitionerSearchRow>>(StatusCodes.Status200OK)]
    public Task<IReadOnlyList<PublicPractitionerSearchRow>> SearchPractitioners(
        [FromQuery, StringLength(120)] string? q = null,
        [FromQuery, StringLength(64)] string? speciality = null,
        [FromQuery, StringLength(64)] string? city = null,
        [FromQuery(Name = "verified_only")] bool verifiedOnly = false,
        [FromQuery, Range(1, 50)] int limit = 40,
        [FromQuery, Range(0, 10_000)] int offset = 0,
        CancellationToken ct = default) =>
        publicProcedures.PractitionerSearchAsync(q, speciality, city, verifiedOnly, limit, offset, ct);

    [HttpGet("practitioners/{id:guid}")]
    [OutputCache(PolicyName = CachePolicies.Profile)]
    [RequireBrandFeature("directory", "booking")]
    [ProducesResponseType<PublicPractitionerGetRow>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public Task<PublicPractitionerGetRow> GetPractitioner(Guid id, CancellationToken ct) =>
        publicProcedures.PractitionerGetAsync(id, ct);

    [HttpGet("practitioners/{id:guid}/services")]
    [OutputCache(PolicyName = CachePolicies.Profile)]
    [RequireBrandFeature("directory", "booking")]
    [ProducesResponseType<IReadOnlyList<PublicPractitionerServicesRow>>(StatusCodes.Status200OK)]
    public Task<IReadOnlyList<PublicPractitionerServicesRow>> ListPractitionerServices(Guid id, CancellationToken ct) =>
        publicProcedures.PractitionerServicesAsync(id, ct);

    [HttpGet("practitioners/{id:guid}/slots")]
    [OutputCache(PolicyName = CachePolicies.NoCache)]
    [ResponseCache(NoStore = true)]
    [RequireBrandFeature("directory", "booking")]
    [ProducesResponseType<IReadOnlyList<PublicSlotsListRow>>(StatusCodes.Status200OK)]
    public async Task<IActionResult> ListSlots(
        Guid id,
        [FromQuery] Guid? service = null,
        [FromQuery(Name = "service_id")] Guid? serviceId = null,
        [FromQuery, Required] DateOnly from = default,
        [FromQuery, Required] DateOnly to = default,
        CancellationToken ct = default)
    {
        var resolvedService = service ?? serviceId;
        if (resolvedService is null || resolvedService == Guid.Empty)
        {
            HttpContext.Items["error_code"] = "invalid_argument";
            return Problem(
                type: "https://babyblue.co.za/errors/invalid_argument",
                title: "invalid_argument",
                statusCode: StatusCodes.Status400BadRequest,
                extensions: new Dictionary<string, object?>
                {
                    ["code"] = "invalid_argument",
                    ["request_id"] = HttpContext.TraceIdentifier,
                });
        }

        if (to < from || (to.DayNumber - from.DayNumber) > 31)
        {
            HttpContext.Items["error_code"] = "invalid_range";
            return Problem(
                type: "https://babyblue.co.za/errors/invalid_range",
                title: "invalid_range",
                statusCode: StatusCodes.Status400BadRequest,
                extensions: new Dictionary<string, object?>
                {
                    ["code"] = "invalid_range",
                    ["request_id"] = HttpContext.TraceIdentifier,
                });
        }

        var rows = await publicProcedures.SlotsListAsync(id, resolvedService.Value, from, to, ct);
        return Ok(rows);
    }

    [HttpGet("cities")]
    [OutputCache(PolicyName = CachePolicies.Facets)]
    [RequireBrandFeature("directory")]
    [ProducesResponseType<IReadOnlyList<PublicCityListRow>>(StatusCodes.Status200OK)]
    public Task<IReadOnlyList<PublicCityListRow>> ListCities(CancellationToken ct) =>
        publicProcedures.CityListAsync(ct);

    [HttpGet("specialities")]
    [OutputCache(PolicyName = CachePolicies.Facets)]
    [RequireBrandFeature("directory")]
    [ProducesResponseType<IReadOnlyList<PublicSpecialityListRow>>(StatusCodes.Status200OK)]
    public Task<IReadOnlyList<PublicSpecialityListRow>> ListSpecialities(CancellationToken ct) =>
        publicProcedures.SpecialityListAsync(ct);
}
