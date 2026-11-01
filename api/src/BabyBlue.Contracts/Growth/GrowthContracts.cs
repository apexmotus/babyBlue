using System.ComponentModel.DataAnnotations;
using System.Text.Json;
using BabyBlue.Contracts.Generated;

namespace BabyBlue.Contracts.Growth;

/// <summary>Identifier of a created Growth resource.</summary>
public sealed record GrowthIdResponse(Guid Id);

public sealed record CreateGrowthRequestRequest
{
    /// <summary>
    /// A <c>marketing_services.id</c>, not a slug: <c>growth_request_create</c> takes
    /// <c>p_service uuid</c>. <c>GET /v1/growth/services</c> supplies the catalogue.
    /// </summary>
    [Required]
    public Guid ServiceId { get; init; }

    [Required, StringLength(160, MinimumLength = 3)]
    public string Title { get; init; } = "";

    [Required, StringLength(8000, MinimumLength = 1)]
    public string Brief { get; init; } = "";

    [Range(0, 1_000_000_000)]
    public int? BudgetMinCents { get; init; }

    [Range(0, 1_000_000_000)]
    public int? BudgetMaxCents { get; init; }

    public DateOnly? Deadline { get; init; }

    /// <summary>A maximum below the minimum is a shape error, so it is refused at the edge.</summary>
    public bool BudgetIsOrdered() =>
        BudgetMinCents is null || BudgetMaxCents is null || BudgetMaxCents >= BudgetMinCents;
}

public sealed record SetGrowthStatusRequest
{
    /// <summary>
    /// A <c>marketing_status</c> label. Which transitions are legal, and which party may make
    /// them, is the procedure's eight-way state machine — this only rejects a label the enum does
    /// not have, which would otherwise reach the database as SQLSTATE <c>22P02</c> and map to no
    /// documented code.
    /// </summary>
    [Required]
    public string Status { get; init; } = "";

    public static string[] Allowed => PgEnums.MarketingStatus;
}

public sealed record PostGrowthUpdateRequest
{
    [Required, StringLength(4000, MinimumLength = 1)]
    public string Body { get; init; } = "";
}

public sealed record AddGrowthApprovalRequest
{
    /// <summary>What is being put up for approval. Operator-only, enforced in the procedure.</summary>
    [Required, StringLength(240, MinimumLength = 1)]
    public string Item { get; init; } = "";
}

public sealed record DecideGrowthApprovalRequest
{
    [Required, AllowedValues("approved", "changes_requested")]
    public string Status { get; init; } = "";

    [StringLength(2000)]
    public string? Comment { get; init; }
}

public sealed record CreateGrowthReportRequest
{
    [Required, StringLength(64, MinimumLength = 1)]
    public string Period { get; init; } = "";

    [Required, StringLength(8000, MinimumLength = 1)]
    public string Summary { get; init; } = "";

    /// <summary>
    /// Metric name to value. An unrecognised metric is <c>400 metric_unknown</c> from the
    /// procedure, which names the offending key in <c>detail</c>.
    /// </summary>
    public JsonElement? Metrics { get; init; }

    public const int MaxMetricsBytes = 16 * 1024;
}
