using BabyBlue.Contracts.Auth;

namespace BabyBlue.Api.Middleware;

public static class BrandKeys
{
    public const string Resolved = "BabyBlue.ResolvedBrand";

    public static ResolvedBrand? GetResolvedBrand(this HttpContext context) =>
        context.Items.TryGetValue(Resolved, out var val) ? val as ResolvedBrand : null;
}
