using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;

namespace BabyBlue.Api.Auth;

public static class SupabaseJwtSetup
{
    public const string DefaultSupabaseUrl = "https://local.supabase.co";
    public const string TestJwtSecret = "super-secret-jwt-token-with-at-least-32-characters-long";

    public static IServiceCollection AddSupabaseJwtAuthentication(
        this IServiceCollection services,
        IConfiguration configuration,
        IHostEnvironment environment)
    {
        // `??` only catches null. A present-but-empty setting -- an unset environment variable,
        // or a placeholder key in appsettings.json -- would otherwise yield an issuer of
        // "/auth/v1" and reject every token with a 401 that names no cause.
        var configuredUrl = configuration["Supabase:Url"];
        var supabaseUrl = (string.IsNullOrWhiteSpace(configuredUrl) ? DefaultSupabaseUrl : configuredUrl)
            .Trim()
            .TrimEnd('/');
        var issuer = $"{supabaseUrl}/auth/v1";

        var jwtSecret = configuration["Supabase:JwtSecret"];
        if (string.IsNullOrWhiteSpace(jwtSecret) &&
            (environment.IsDevelopment() || environment.EnvironmentName == "Testing"))
        {
            jwtSecret = TestJwtSecret;
        }

        services
            .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
            .AddJwtBearer(o =>
            {
                o.MapInboundClaims = false;

                if (string.IsNullOrWhiteSpace(jwtSecret))
                {
                    o.Authority = issuer;
                    o.MetadataAddress = $"{issuer}/.well-known/openid-configuration";
                }

                var validationParameters = new TokenValidationParameters
                {
                    ValidateIssuer = true,
                    ValidIssuer = issuer,
                    ValidateAudience = true,
                    ValidAudience = "authenticated",
                    ValidateLifetime = true,
                    ClockSkew = TimeSpan.FromSeconds(30),
                    ValidateIssuerSigningKey = true,
                    NameClaimType = "sub",
                };

                if (!string.IsNullOrWhiteSpace(jwtSecret))
                {
                    validationParameters.IssuerSigningKey = new SymmetricSecurityKey(
                        Encoding.UTF8.GetBytes(jwtSecret));

                    // Pin the algorithm to the key type. Without this the handler accepts any
                    // algorithm the key can satisfy, which is the ground algorithm-confusion
                    // attacks stand on.
                    validationParameters.ValidAlgorithms = [SecurityAlgorithms.HmacSha256];
                }
                else
                {
                    // D-30 default: asymmetric JWKS. `none` and every symmetric algorithm are
                    // refused outright, so a forged token cannot downgrade its way in.
                    validationParameters.ValidAlgorithms =
                    [
                        SecurityAlgorithms.EcdsaSha256,
                        SecurityAlgorithms.RsaSha256,
                    ];
                }

                o.TokenValidationParameters = validationParameters;

                o.Events = new JwtBearerEvents
                {
                    OnChallenge = async ctx =>
                    {
                        ctx.HandleResponse();
                        var code = IsExpiredToken(ctx.AuthenticateFailure)
                            ? "token_expired"
                            : "not_authenticated";

                        ctx.HttpContext.Items["error_code"] = code;
                        await Results.Problem(
                            type: $"https://babyblue.co.za/errors/{code}",
                            title: code,
                            statusCode: StatusCodes.Status401Unauthorized,
                            extensions: new Dictionary<string, object?>
                            {
                                ["code"] = code,
                                ["request_id"] = ctx.HttpContext.TraceIdentifier,
                            }).ExecuteAsync(ctx.HttpContext);
                    }
                };
            });

        services.AddAuthorization();
        return services;
    }

    private static bool IsExpiredToken(Exception? failure) =>
        failure is SecurityTokenExpiredException ||
        failure?.InnerException is SecurityTokenExpiredException;
}
