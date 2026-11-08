using System.Text.Json;
using BabyBlue.Contracts.Auth;
using BabyBlue.Data;
using BabyBlue.Data.Npgsql;
using Xunit;

namespace BabyBlue.Api.Tests;

public sealed class SessionContextGuardTests
{
    private static readonly JsonElement EmptyJsonObject =
        JsonDocument.Parse("{}").RootElement.Clone();

    private static CallerContext CreateCaller(string schemaName, DbRole role = DbRole.Authenticated) =>
        new(
            UserId: Guid.Parse("00000000-0000-4000-8000-000000000001"),
            DbRole: role,
            ClaimsJson: """{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}""",
            Brand: new ResolvedBrand(
                BrandId: Guid.Parse("00000000-0000-4000-8000-000000000900"),
                Slug: "babyblue",
                SchemaName: schemaName,
                Status: "active",
                DisplayName: "BabyBlue",
                Theme: EmptyJsonObject,
                CopyOverrides: EmptyJsonObject,
                Features: EmptyJsonObject,
                LogoUrl: null,
                FaviconUrl: null,
                SupportEmail: "support@babyblue.co.za"),
            RequestId: "req-test-001");

    [Theory]
    [InlineData("pg_catalog")]
    [InlineData("bb_babyblue; drop table x")]
    [InlineData("Public")]
    [InlineData("")]
    [InlineData("bb_")]
    [InlineData("bb_1invalidstart")]
    [InlineData("bb_UPPERCASE")]
    [InlineData("bb_too_long_schema_name_exceeding_limit_12345")]
    [InlineData("public, pg_catalog")]
    public async Task ApplyAsync_Rejects_Invalid_SchemaName_Before_Touching_Database(string invalidSchema)
    {
        var caller = CreateCaller(invalidSchema);

        // Passing null connection/transaction proves the guard rejects before touching the DB:
        var ex = await Assert.ThrowsAsync<InvalidOperationException>(
            () => SessionContext.ApplyAsync(null!, null!, caller, CancellationToken.None));

        Assert.Equal("invalid_schema", ex.Message);
    }

    [Theory]
    [InlineData("public")]
    [InlineData("bb_babyblue")]
    [InlineData("bb_smilegroup")]
    [InlineData("bb_testbrand")]
    public async Task ApplyAsync_Accepts_Valid_SchemaName_And_Reaches_Connection_Check(string validSchema)
    {
        var caller = CreateCaller(validSchema);

        // Passing the schema and role guards reaches ArgumentNullException for the connection:
        var ex = await Assert.ThrowsAsync<ArgumentNullException>(
            () => SessionContext.ApplyAsync(null!, null!, caller, CancellationToken.None));

        Assert.Equal("cx", ex.ParamName);
    }

    [Theory]
    [InlineData((DbRole)(-1))]
    [InlineData((DbRole)2)]
    [InlineData((DbRole)999)]
    public async Task ApplyAsync_Rejects_OutOfRange_DbRole_Before_Touching_Database(DbRole invalidRole)
    {
        var caller = CreateCaller("public", invalidRole);

        var ex = await Assert.ThrowsAsync<InvalidOperationException>(
            () => SessionContext.ApplyAsync(null!, null!, caller, CancellationToken.None));

        Assert.Equal("invalid_role", ex.Message);
    }

    [Fact]
    public void ResolvedBrand_IsFeatureEnabled_Reads_Explicit_Json_And_Falls_Back_To_Default()
    {
        using var doc = JsonDocument.Parse("""{"booking":true,"growth":false,"layout":"standard"}""");
        var brand = new ResolvedBrand(
            BrandId: Guid.NewGuid(),
            Slug: "babyblue",
            SchemaName: "public",
            Status: "active",
            DisplayName: "BabyBlue",
            Theme: EmptyJsonObject,
            CopyOverrides: EmptyJsonObject,
            Features: doc.RootElement.Clone(),
            LogoUrl: null,
            FaviconUrl: null,
            SupportEmail: "support@babyblue.co.za");

        Assert.True(brand.IsFeatureEnabled("booking", defaultValue: false));
        Assert.False(brand.IsFeatureEnabled("growth", defaultValue: true));
        Assert.False(brand.IsFeatureEnabled("clinical", defaultValue: false));
        Assert.True(brand.IsFeatureEnabled("unconfigured_flag", defaultValue: true));
        Assert.True(brand.IsFeatureEnabled("layout", defaultValue: true));
    }

    [Fact]
    public void DataSourceFactory_Enforces_Pooling_NoResetOnClose_And_IncludeErrorDetail_Invariants()
    {
        using var ds = DataSourceFactory.Create(
            new DatabaseOptions
            {
                ConnectionString = "Host=localhost;Port=5432;Database=babyblue;Username=bb_api;Password=secret;No Reset On Close=true;Include Error Detail=true",
                MaxPoolSize = 40,
                MinPoolSize = 5
            });

        var csb = new Npgsql.NpgsqlConnectionStringBuilder(ds.ConnectionString);
        Assert.True(csb.Pooling);
        Assert.Equal(5, csb.MinPoolSize);
        Assert.Equal(40, csb.MaxPoolSize);
        Assert.Equal(10, csb.Timeout);
        Assert.Equal(20, csb.CommandTimeout);
        Assert.False(csb.NoResetOnClose);
        Assert.False(csb.IncludeErrorDetail);
        Assert.Equal(Npgsql.SslMode.VerifyFull, csb.SslMode);
    }
}
