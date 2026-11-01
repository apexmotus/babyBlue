using System.Text.Json;

namespace BabyBlue.Contracts.Auth;

public enum DbRole
{
    Anonymous,
    Authenticated
}

public sealed record ResolvedBrand(
    Guid BrandId,
    string Slug,
    string SchemaName,
    string Status,
    string DisplayName,
    JsonElement Theme,
    JsonElement CopyOverrides,
    JsonElement Features,
    string? LogoUrl,
    string? FaviconUrl,
    string SupportEmail)
{
    public bool IsFeatureEnabled(string featureKey, bool defaultValue = true) =>
        Features.ValueKind == JsonValueKind.Object &&
        Features.TryGetProperty(featureKey, out var prop) &&
        prop.ValueKind is JsonValueKind.True or JsonValueKind.False
            ? prop.GetBoolean()
            : defaultValue;
}

public sealed record CallerContext(
    Guid? UserId,
    DbRole DbRole,
    string ClaimsJson,
    ResolvedBrand Brand,
    string RequestId);
