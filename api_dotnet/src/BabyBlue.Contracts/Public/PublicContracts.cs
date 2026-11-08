using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;

namespace BabyBlue.Contracts.Public;

public sealed class JoinQueueRequest : IValidatableObject
{
    [StringLength(120, MinimumLength = 1)]
    [JsonPropertyName("full_name")]
    public string? FullName { get; init; }

    [StringLength(120, MinimumLength = 1)]
    [JsonPropertyName("name")]
    public string? Name { get; init; }

    [RegularExpression(@"^\+[1-9][0-9]{7,14}$")]
    [JsonPropertyName("phone")]
    public string? Phone { get; init; }

    [AllowedValues("routine", "urgent")]
    [JsonPropertyName("urgency")]
    public string Urgency { get; init; } = "routine";

    public string ResolvedName => !string.IsNullOrWhiteSpace(FullName)
        ? FullName!
        : Name ?? string.Empty;

    public IEnumerable<ValidationResult> Validate(ValidationContext validationContext)
    {
        if (string.IsNullOrWhiteSpace(FullName) && string.IsNullOrWhiteSpace(Name))
        {
            yield return new ValidationResult("FullName or Name is required.", [nameof(FullName)]);
        }
    }
}

public sealed record JoinQueueResponse(string Token);
