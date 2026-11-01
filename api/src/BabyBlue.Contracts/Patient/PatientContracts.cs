using System;
using System.ComponentModel.DataAnnotations;
using System.Text.RegularExpressions;

namespace BabyBlue.Contracts.Patient;

public sealed record UpdateProfileRequest
{
    public const string PhonePattern = @"^\+[1-9][0-9]{7,14}$";

    [Required]
    [StringLength(120, MinimumLength = 1)]
    public string DisplayName { get; init; } = "";

    [RegularExpression(PhonePattern)]
    public string? Phone { get; init; }

    public static bool IsValidPhone(string? phone) =>
        string.IsNullOrEmpty(phone) || Regex.IsMatch(phone, PhonePattern);
}

public sealed record CreateSlotHoldRequest
{
    [Required]
    public Guid PractitionerId { get; init; }

    [Required]
    public Guid ServiceId { get; init; }

    [Required]
    public DateTimeOffset StartsAt { get; init; }
}

public sealed record BookAppointmentRequest
{
    [Required]
    public Guid HoldId { get; init; }
}

public sealed record CancelAppointmentRequest
{
    [StringLength(240)]
    public string? Reason { get; init; }
}

public sealed record RescheduleAppointmentRequest
{
    [Required]
    public DateTimeOffset NewStartsAt { get; init; }
}

public sealed record CreatedIdResponse(Guid Id);
