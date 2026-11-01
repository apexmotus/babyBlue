using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using BabyBlue.Api.Auth;
using BabyBlue.Data;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.Tokens;

namespace BabyBlue.Integration.Tests.Fixtures;

public sealed class BabyBlueApiFactory(
    string bbApiConnectionString,
    int maxPoolSize = 10,
    int minPoolSize = 0) : WebApplicationFactory<Program>
{
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.ConfigureAppConfiguration((_, config) =>
        {
            config.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Database:ConnectionString"] = bbApiConnectionString,
                ["Database:MaxPoolSize"] = maxPoolSize.ToString(),
                ["Database:MinPoolSize"] = minPoolSize.ToString(),
                ["Database:AllowInsecureSslForLocalTesting"] = "true",
                ["Supabase:Url"] = SupabaseJwtSetup.DefaultSupabaseUrl,
                ["Supabase:JwtSecret"] = SupabaseJwtSetup.TestJwtSecret,
            });
        });
    }

    public HttpClient CreateDefaultHostClient(string host = "babyblue.co.za") =>
        WebApplicationFactoryExtensions.CreateDefaultHostClient(this, host);
}

public static class WebApplicationFactoryExtensions
{
    public static HttpClient CreateDefaultHostClient(
        this WebApplicationFactory<Program> factory,
        string host = "babyblue.co.za") =>
        factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            BaseAddress = new Uri($"https://{host}"),
            AllowAutoRedirect = false,
        });
}

public static class JwtTestTokenBuilder
{
    public static string CreateToken(
        Guid? sub,
        string role = "authenticated",
        string? email = null,
        DateTimeOffset? expiresAt = null,
        string? rawSubOverride = null,
        string audience = "authenticated")
    {
        var now = DateTimeOffset.UtcNow;
        var exp = expiresAt ?? now.AddMinutes(30);
        var nbf = exp < now ? exp.AddMinutes(-30) : now.AddMinutes(-1);

        var claims = new List<Claim>
        {
            new("role", role),
        };

        var subValue = rawSubOverride ?? sub?.ToString();
        if (subValue is not null)
        {
            claims.Add(new Claim("sub", subValue));
        }

        if (!string.IsNullOrEmpty(email))
        {
            claims.Add(new Claim("email", email));
        }

        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(SupabaseJwtSetup.TestJwtSecret));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var token = new JwtSecurityToken(
            issuer: $"{SupabaseJwtSetup.DefaultSupabaseUrl}/auth/v1",
            audience: audience,
            claims: claims,
            notBefore: nbf.UtcDateTime,
            expires: exp.UtcDateTime,
            signingCredentials: creds);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}
