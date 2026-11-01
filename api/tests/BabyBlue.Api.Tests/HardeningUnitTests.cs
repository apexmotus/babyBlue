using System.Net;
using BabyBlue.Api.Auth;
using BabyBlue.Api.Middleware;
using BabyBlue.Api.Network;
using BabyBlue.Api.RateLimiting;
using BabyBlue.Data;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Xunit;

namespace BabyBlue.Api.Tests;

public sealed class HardeningUnitTests
{
    private sealed class StubEnvironment(string name) : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = name;
        public string ApplicationName { get; set; } = "BabyBlue.Api";
        public string ContentRootPath { get; set; } = AppContext.BaseDirectory;
        public Microsoft.Extensions.FileProviders.IFileProvider ContentRootFileProvider { get; set; } =
            new Microsoft.Extensions.FileProviders.NullFileProvider();
    }

    private static IConfiguration Config(params (string Key, string Value)[] values) =>
        new ConfigurationBuilder()
            .AddInMemoryCollection(values.Select(v => new KeyValuePair<string, string?>(v.Key, v.Value)))
            .Build();

    // ---- Host pre-filter: the cheap half of the pre-auth brand-resolution guard ----

    [Theory]
    [InlineData("babyblue.co.za")]
    [InlineData("book.testbrand.co.za")]
    [InlineData("localhost")]
    [InlineData("a-b.example")]
    public void IsPlausibleHost_Accepts_Registrable_Hosts(string host) =>
        Assert.True(BrandRegistry.IsPlausibleHost(host));

    [Theory]
    [InlineData("")]
    [InlineData(".leading.dot")]
    [InlineData("trailing.dot.")]
    [InlineData("double..dot")]
    [InlineData("-leadinghyphen.example")]
    [InlineData("trailinghyphen-.example")]
    [InlineData("under_score.example")]
    [InlineData("has space.example")]
    [InlineData("semi;colon.example")]
    public void IsPlausibleHost_Rejects_Impossible_Hosts_Before_Any_Query(string host) =>
        Assert.False(BrandRegistry.IsPlausibleHost(host));

    [Fact]
    public void IsPlausibleHost_Rejects_Oversized_Names_And_Labels()
    {
        Assert.False(BrandRegistry.IsPlausibleHost(new string('a', 254)));
        Assert.False(BrandRegistry.IsPlausibleHost($"{new string('a', 64)}.example"));
        Assert.True(BrandRegistry.IsPlausibleHost($"{new string('a', 63)}.example"));
    }

    // ---- Rate-limit partition identity ----

    [Fact]
    public void ClientIpOf_Returns_The_Full_Address_For_IPv4()
    {
        var ctx = new DefaultHttpContext();
        ctx.Connection.RemoteIpAddress = IPAddress.Parse("203.0.113.7");
        Assert.Equal("203.0.113.7", BabyBlueRateLimiterPolicies.ClientIpOf(ctx));
    }

    [Fact]
    public void ClientIpOf_Unwraps_An_IPv4_Mapped_IPv6_Address()
    {
        var ctx = new DefaultHttpContext();
        ctx.Connection.RemoteIpAddress = IPAddress.Parse("::ffff:203.0.113.7");
        Assert.Equal("203.0.113.7", BabyBlueRateLimiterPolicies.ClientIpOf(ctx));
    }

    [Fact]
    public void ClientIpOf_Collapses_An_IPv6_Address_To_Its_Slash64()
    {
        // An end user is handed a whole /64 and can rotate inside it freely, so limiting per
        // full address would give them an unlimited supply of partitions.
        var a = new DefaultHttpContext();
        a.Connection.RemoteIpAddress = IPAddress.Parse("2001:db8:abcd:1234::1");
        var b = new DefaultHttpContext();
        b.Connection.RemoteIpAddress = IPAddress.Parse("2001:db8:abcd:1234:ffff:ffff:ffff:ffff");

        Assert.Equal(
            BabyBlueRateLimiterPolicies.ClientIpOf(a),
            BabyBlueRateLimiterPolicies.ClientIpOf(b));

        var other = new DefaultHttpContext();
        other.Connection.RemoteIpAddress = IPAddress.Parse("2001:db8:abcd:9999::1");
        Assert.NotEqual(
            BabyBlueRateLimiterPolicies.ClientIpOf(a),
            BabyBlueRateLimiterPolicies.ClientIpOf(other));
    }

    [Fact]
    public void ClientIpOf_Does_Not_Fabricate_Loopback_For_A_Missing_Address()
    {
        // Returning 127.0.0.1 would silently merge address-less requests into the partition a
        // local developer also occupies.
        Assert.Equal("unknown", BabyBlueRateLimiterPolicies.ClientIpOf(new DefaultHttpContext()));
    }

    // ---- Forwarded-headers trust boundary ----

    [Fact]
    public void ForwardedHeaders_Refuses_To_Trust_An_Unrestricted_Header_Outside_Development()
    {
        var ex = Assert.Throws<InvalidOperationException>(() =>
            new ServiceCollection().AddBabyBlueForwardedHeaders(
                Config(("Network:TrustForwardedHeaders", "true")),
                new StubEnvironment(Environments.Production)));

        Assert.Contains("KnownProxies", ex.Message, StringComparison.Ordinal);
    }

    [Fact]
    public void ForwardedHeaders_Accepts_A_Configured_Boundary()
    {
        new ServiceCollection().AddBabyBlueForwardedHeaders(
            Config(
                ("Network:TrustForwardedHeaders", "true"),
                ("Network:KnownNetworks:0", "10.0.0.0/8")),
            new StubEnvironment(Environments.Production));
    }

    [Fact]
    public void ForwardedHeaders_Are_Off_By_Default_So_Nothing_Spoofable_Is_Trusted()
    {
        // A direct-addressed instance is a legitimate deployment; the posture is logged, not fatal.
        new ServiceCollection().AddBabyBlueForwardedHeaders(
            Config(), new StubEnvironment(Environments.Production));
    }

    [Theory]
    [InlineData("10.0.0.0/8")]
    [InlineData("2001:db8::/32")]
    public void ParseCidr_Accepts_Valid_Notation(string cidr) =>
        Assert.NotNull(ForwardedHeadersSetup.ParseCidr(cidr).ToString());

    [Theory]
    [InlineData("10.0.0.0")]
    [InlineData("10.0.0.0/33")]
    [InlineData("not-an-address/8")]
    [InlineData("2001:db8::/129")]
    public void ParseCidr_Rejects_Invalid_Notation(string cidr) =>
        Assert.Throws<InvalidOperationException>(() => ForwardedHeadersSetup.ParseCidr(cidr));

    // ---- Production configuration guards ----

    [Fact]
    public void RuntimeGuards_Refuse_A_Production_Start_Without_A_Log_Salt()
    {
        var ex = Assert.Throws<InvalidOperationException>(() =>
            new ServiceCollection().AddBabyBlueRuntimeGuards(
                Config(("Supabase:Url", "https://proj.supabase.co")),
                new StubEnvironment(Environments.Production)));

        Assert.Contains("Observability:UserHashSalt", ex.Message, StringComparison.Ordinal);
    }

    [Fact]
    public void RuntimeGuards_Refuse_A_Symmetric_Jwt_Secret_In_Production()
    {
        var ex = Assert.Throws<InvalidOperationException>(() =>
            new ServiceCollection().AddBabyBlueRuntimeGuards(
                Config(
                    ("Observability:UserHashSalt", "a-real-salt"),
                    ("Supabase:Url", "https://proj.supabase.co"),
                    ("Supabase:JwtSecret", "a-shared-hs256-secret")),
                new StubEnvironment(Environments.Production)));

        Assert.Contains("asymmetric JWKS", ex.Message, StringComparison.Ordinal);
    }

    [Fact]
    public void RuntimeGuards_Allow_A_Symmetric_Secret_When_Accepted_Explicitly()
    {
        new ServiceCollection().AddBabyBlueRuntimeGuards(
            Config(
                ("Observability:UserHashSalt", "a-real-salt"),
                ("Supabase:Url", "https://proj.supabase.co"),
                ("Supabase:JwtSecret", "a-shared-hs256-secret"),
                ("Supabase:AllowSymmetricJwtOutsideDevelopment", "true")),
            new StubEnvironment(Environments.Production));
    }

    [Fact]
    public void RuntimeGuards_Pass_On_A_Fully_Configured_Production_Setup()
    {
        new ServiceCollection().AddBabyBlueRuntimeGuards(
            Config(
                ("Observability:UserHashSalt", "a-real-salt"),
                ("Supabase:Url", "https://proj.supabase.co")),
            new StubEnvironment(Environments.Production));
    }

    [Fact]
    public void RuntimeGuards_Stay_Out_Of_The_Way_Locally()
    {
        new ServiceCollection().AddBabyBlueRuntimeGuards(Config(), new StubEnvironment(Environments.Development));
        new ServiceCollection().AddBabyBlueRuntimeGuards(Config(), new StubEnvironment("Testing"));
    }

    // ---- Configuration reads must treat empty as absent ----

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void SupabaseJwt_Treats_An_Empty_Url_As_Absent(string? configuredUrl)
    {
        // An unset environment variable and a placeholder key both arrive as "", which `??`
        // does not catch. Letting it through built the issuer "/auth/v1" and rejected every
        // token with a 401 that named no cause.
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddSupabaseJwtAuthentication(
            Config(("Supabase:Url", configuredUrl!)),
            new StubEnvironment("Testing"));

        var options = services.BuildServiceProvider()
            .GetRequiredService<IOptionsMonitor<JwtBearerOptions>>()
            .Get(JwtBearerDefaults.AuthenticationScheme);

        Assert.Equal(
            $"{SupabaseJwtSetup.DefaultSupabaseUrl}/auth/v1",
            options.TokenValidationParameters.ValidIssuer);
    }

    [Fact]
    public void SupabaseJwt_Uses_A_Configured_Url_And_Tolerates_A_Trailing_Slash()
    {
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddSupabaseJwtAuthentication(
            Config(("Supabase:Url", " https://proj.supabase.co/ ")),
            new StubEnvironment("Testing"));

        var options = services.BuildServiceProvider()
            .GetRequiredService<IOptionsMonitor<JwtBearerOptions>>()
            .Get(JwtBearerDefaults.AuthenticationScheme);

        Assert.Equal("https://proj.supabase.co/auth/v1", options.TokenValidationParameters.ValidIssuer);
    }

    [Fact]
    public void SupabaseJwt_Pins_The_Signing_Algorithm_To_The_Key_Type()
    {
        var symmetric = new ServiceCollection();
        symmetric.AddLogging();
        symmetric.AddSupabaseJwtAuthentication(
            Config(("Supabase:JwtSecret", SupabaseJwtSetup.TestJwtSecret)),
            new StubEnvironment("Testing"));
        var symmetricOptions = symmetric.BuildServiceProvider()
            .GetRequiredService<IOptionsMonitor<JwtBearerOptions>>()
            .Get(JwtBearerDefaults.AuthenticationScheme);
        Assert.Equal(["HS256"], symmetricOptions.TokenValidationParameters.ValidAlgorithms);

        // The JWKS default must refuse `none` and every symmetric algorithm.
        var asymmetric = new ServiceCollection();
        asymmetric.AddLogging();
        asymmetric.AddSupabaseJwtAuthentication(
            Config(("Supabase:Url", "https://proj.supabase.co")),
            new StubEnvironment(Environments.Staging));
        var asymmetricOptions = asymmetric.BuildServiceProvider()
            .GetRequiredService<IOptionsMonitor<JwtBearerOptions>>()
            .Get(JwtBearerDefaults.AuthenticationScheme);
        Assert.Equal(["ES256", "RS256"], asymmetricOptions.TokenValidationParameters.ValidAlgorithms);
    }

    // ---- Rate-limit rejection codes ----

    [Fact]
    public void RejectionCodeFor_Reports_RateLimited_When_No_Policy_Is_Attached()
    {
        Assert.Equal("rate_limited", BabyBlueRateLimiterPolicies.RejectionCodeFor(new DefaultHttpContext()));
    }
}
