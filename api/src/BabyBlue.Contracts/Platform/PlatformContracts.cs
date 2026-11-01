using System.ComponentModel.DataAnnotations;

namespace BabyBlue.Contracts.Platform;

public sealed record GrantPlatformRoleRequest
{
    [Required, EmailAddress, StringLength(254)]
    public string Email { get; init; } = "";

    [Required, AllowedValues("platform_admin", "marketing_operator")]
    public string Role { get; init; } = "";
}

public sealed record SetPracticeStatusRequest
{
    [Required, AllowedValues("pending", "active", "suspended")]
    public string Status { get; init; } = "";

    [StringLength(500)]
    public string? Reason { get; init; }
}

public sealed record SetVerificationRequest
{
    /// <summary>
    /// D-06: verification is the platform's decision, never the practice's. A practice can read
    /// its own verification history but there is no practice-side route that writes it.
    /// </summary>
    [Required, AllowedValues("unverified", "pending", "verified", "rejected")]
    public string Status { get; init; } = "";

    [StringLength(500)]
    public string? Note { get; init; }
}
