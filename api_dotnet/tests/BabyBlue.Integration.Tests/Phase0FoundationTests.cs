using System.Text.Json;
using BabyBlue.Contracts.Auth;
using BabyBlue.Data;
using BabyBlue.Data.Npgsql;
using BabyBlue.Integration.Tests.Fixtures;
using Dapper;
using Npgsql;
using Xunit;

namespace BabyBlue.Integration.Tests;

[Collection(PostgresDatabaseCollection.Name)]
public sealed class Phase0FoundationTests(PostgresDatabaseFixture db)
{
    private static readonly JsonElement EmptyJsonObject =
        JsonDocument.Parse("{}").RootElement.Clone();

    private static ResolvedBrand CreateBrand(string schemaName = "public") =>
        new(
            BrandId: PostgresDatabaseFixture.BabyBlueBrandId,
            Slug: "babyblue",
            SchemaName: schemaName,
            Status: "active",
            DisplayName: "BabyBlue",
            Theme: EmptyJsonObject,
            CopyOverrides: EmptyJsonObject,
            Features: EmptyJsonObject,
            LogoUrl: null,
            FaviconUrl: null,
            SupportEmail: "support@babyblue.co.za");

    // ───────────────────────── Exit Gate 2: Startup Role Validation Test ─────────────────────────

    [Fact]
    public async Task StartupValidator_Succeeds_For_BbApi_And_Proves_Cannot_Assume_ServiceRole()
    {
        await using var dataSource = DataSourceFactory.Create(
            db.BbApiConnectionString,
            allowInsecureSslForLocalTesting: true,
            maxPoolSize: 2,
            minPoolSize: 0);

        await DatabaseStartupValidator.ValidateRolePostureAsync(dataSource);

        await using var conn = await dataSource.OpenConnectionAsync();
        var canAssumeServiceRole = await conn.ExecuteScalarAsync<bool>(
            "select pg_has_role('bb_api', 'service_role', 'member')");
        var connectionLimit = await conn.ExecuteScalarAsync<int>(
            "select rolconnlimit from pg_roles where rolname = 'bb_api'");

        Assert.False(canAssumeServiceRole);
        Assert.Equal(85, connectionLimit);
    }

    [Fact]
    public async Task StartupValidator_Throws_When_Connecting_As_Postgres_Superuser()
    {
        await using var dataSource = DataSourceFactory.Create(
            db.SuperuserConnectionString,
            allowInsecureSslForLocalTesting: true,
            maxPoolSize: 1,
            minPoolSize: 0);

        var ex = await Assert.ThrowsAsync<InvalidOperationException>(
            () => DatabaseStartupValidator.ValidateRolePostureAsync(dataSource));

        Assert.Contains("expected current_user = 'bb_api'", ex.Message);
    }

    [Fact]
    public async Task StartupValidator_Throws_When_Role_Has_RolInherit_True()
    {
        await using var dataSource = DataSourceFactory.Create(
            db.InheritRoleConnectionString,
            allowInsecureSslForLocalTesting: true,
            maxPoolSize: 1,
            minPoolSize: 0);

        var ex = await Assert.ThrowsAsync<InvalidOperationException>(
            () => DatabaseStartupValidator.ValidateRolePostureAsync(dataSource));

        Assert.NotNull(ex);
    }

    [Fact]
    public async Task StartupValidator_Throws_When_BbApi_Temporarily_Has_Inherit_Or_ServiceRole()
    {
        await using var adminConn = new NpgsqlConnection(db.SuperuserConnectionString);
        await adminConn.OpenAsync();

        await using var dataSource = DataSourceFactory.Create(
            db.BbApiConnectionString,
            allowInsecureSslForLocalTesting: true,
            maxPoolSize: 1,
            minPoolSize: 0);

        // 1. Temporarily set INHERIT on bb_api and verify validator aborts startup:
        await adminConn.ExecuteAsync("alter role bb_api with inherit;");
        try
        {
            var ex = await Assert.ThrowsAsync<InvalidOperationException>(
                () => DatabaseStartupValidator.ValidateRolePostureAsync(dataSource));
            Assert.Contains("rolinherit = true", ex.Message);
        }
        finally
        {
            await adminConn.ExecuteAsync("alter role bb_api with noinherit;");
        }

        // 2. Temporarily grant service_role to bb_api and verify validator aborts startup:
        await adminConn.ExecuteAsync("grant service_role to bb_api;");
        try
        {
            var ex = await Assert.ThrowsAsync<InvalidOperationException>(
                () => DatabaseStartupValidator.ValidateRolePostureAsync(dataSource));
            Assert.Contains("service_role", ex.Message);
        }
        finally
        {
            await adminConn.ExecuteAsync("revoke service_role from bb_api;");
        }
    }

    // ───────────────────────── Exit Gate 3: noinherit Enforcement Test ─────────────────────────

    [Fact]
    public async Task Calling_PublicCityList_As_BbApi_Without_SessionContext_Fails_With_42501()
    {
        await using var dataSource = DataSourceFactory.Create(
            db.BbApiConnectionString,
            allowInsecureSslForLocalTesting: true,
            maxPoolSize: 1,
            minPoolSize: 0);

        await using var conn = await dataSource.OpenConnectionAsync();

        var pgEx = await Assert.ThrowsAsync<PostgresException>(async () =>
        {
            await using var cmd = new NpgsqlCommand("select * from public.public_city_list()", conn);
            await cmd.ExecuteNonQueryAsync();
        });

        Assert.Equal("42501", pgEx.SqlState);
        Assert.Contains("public_city_list", pgEx.MessageText);
    }

    [Fact]
    public async Task BbApi_Owns_Zero_Objects_And_Has_Zero_Direct_Table_Grants()
    {
        await using var adminConn = new NpgsqlConnection(db.SuperuserConnectionString);
        await adminConn.OpenAsync();

        var ownedCount = await adminConn.ExecuteScalarAsync<int>(
            """
            select count(*)::int
              from pg_class c
              join pg_roles r on r.oid = c.relowner
             where r.rolname = 'bb_api'
            """);

        var directTableGrants = await adminConn.ExecuteScalarAsync<int>(
            """
            select count(*)::int
              from information_schema.role_table_grants
             where grantee = 'bb_api'
            """);

        Assert.Equal(0, ownedCount);
        Assert.Equal(0, directTableGrants);
    }

    // ───────────────────────── Exit Gate 5: Transaction Unwind Test (MaxPoolSize = 1) ─────────────────────────

    [Fact]
    public async Task SessionContext_Unwinds_Completely_On_Commit_Across_Single_Pooled_Connection()
    {
        await using var dataSource = DataSourceFactory.Create(
            db.BbApiConnectionString,
            allowInsecureSslForLocalTesting: true,
            maxPoolSize: 1,
            minPoolSize: 1);

        int backendPidTx1;

        // Transaction 1: Apply SessionContext as OwnerA (Authenticated) on `public`
        await using (var conn1 = await dataSource.OpenConnectionAsync())
        {
            await using var tx1 = await conn1.BeginTransactionAsync();

            var caller1 = new CallerContext(
                UserId: PostgresDatabaseFixture.OwnerA,
                DbRole: DbRole.Authenticated,
                ClaimsJson: $$$"""{"sub":"{{{PostgresDatabaseFixture.OwnerA}}}","role":"authenticated"}""",
                Brand: CreateBrand("public"),
                RequestId: "req-tx1");

            await SessionContext.ApplyAsync(conn1, tx1, caller1, CancellationToken.None);

            backendPidTx1 = await conn1.ExecuteScalarAsync<int>("select pg_backend_pid()", transaction: tx1);
            var uidInTx1 = await conn1.ExecuteScalarAsync<Guid?>("select auth.uid()", transaction: tx1);
            var roleInTx1 = await conn1.ExecuteScalarAsync<string>("select current_setting('role')", transaction: tx1);
            var searchPathInTx1 = await conn1.ExecuteScalarAsync<string>("select current_setting('search_path')", transaction: tx1);
            var statementTimeoutInTx1 = await conn1.ExecuteScalarAsync<string>("select current_setting('statement_timeout')", transaction: tx1);

            Assert.Equal(PostgresDatabaseFixture.OwnerA, uidInTx1);
            Assert.Equal("authenticated", roleInTx1);
            Assert.Equal("public", searchPathInTx1);
            Assert.Equal("15s", statementTimeoutInTx1);

            await tx1.CommitAsync();
        }

        // Transaction 2: Reuse the exact same physical connection from the size-1 pool and inspect state BEFORE SessionContext.ApplyAsync
        await using (var conn2 = await dataSource.OpenConnectionAsync())
        {
            await using var tx2 = await conn2.BeginTransactionAsync();

            var backendPidTx2 = await conn2.ExecuteScalarAsync<int>("select pg_backend_pid()", transaction: tx2);
            var currentUser = await conn2.ExecuteScalarAsync<string>("select current_user", transaction: tx2);
            var currentRole = await conn2.ExecuteScalarAsync<string>("select current_setting('role')", transaction: tx2);
            var searchPath = await conn2.ExecuteScalarAsync<string>("select current_setting('search_path')", transaction: tx2);
            var activeSchemas = await conn2.ExecuteScalarAsync<string[]>("select current_schemas(false)", transaction: tx2);
            var subClaim = await conn2.ExecuteScalarAsync<string>("select coalesce(current_setting('request.jwt.claim.sub', true), '')", transaction: tx2);

            Assert.Equal(backendPidTx1, backendPidTx2);
            Assert.Equal("bb_api", currentUser);
            Assert.Equal("none", currentRole);
            Assert.Equal("", searchPath?.Trim('"'));
            Assert.Empty(activeSchemas!);
            Assert.Equal("", subClaim);

            await tx2.CommitAsync();
        }
    }

    [Fact]
    public async Task SessionContext_Unwinds_Completely_On_Rollback_Across_Single_Pooled_Connection()
    {
        await using var dataSource = DataSourceFactory.Create(
            db.BbApiConnectionString,
            allowInsecureSslForLocalTesting: true,
            maxPoolSize: 1,
            minPoolSize: 1);

        int backendPidTx1;

        await using (var conn1 = await dataSource.OpenConnectionAsync())
        {
            await using var tx1 = await conn1.BeginTransactionAsync();

            var caller1 = new CallerContext(
                UserId: PostgresDatabaseFixture.OwnerA,
                DbRole: DbRole.Authenticated,
                ClaimsJson: $$$"""{"sub":"{{{PostgresDatabaseFixture.OwnerA}}}","role":"authenticated"}""",
                Brand: CreateBrand("public"),
                RequestId: "req-rollback-1");

            await SessionContext.ApplyAsync(conn1, tx1, caller1, CancellationToken.None);

            backendPidTx1 = await conn1.ExecuteScalarAsync<int>("select pg_backend_pid()", transaction: tx1);
            var uidInTx1 = await conn1.ExecuteScalarAsync<Guid?>("select auth.uid()", transaction: tx1);
            Assert.Equal(PostgresDatabaseFixture.OwnerA, uidInTx1);

            await tx1.RollbackAsync();
        }

        await using (var conn2 = await dataSource.OpenConnectionAsync())
        {
            await using var tx2 = await conn2.BeginTransactionAsync();

            var backendPidTx2 = await conn2.ExecuteScalarAsync<int>("select pg_backend_pid()", transaction: tx2);
            var currentUser = await conn2.ExecuteScalarAsync<string>("select current_user", transaction: tx2);
            var searchPath = await conn2.ExecuteScalarAsync<string>("select current_setting('search_path')", transaction: tx2);
            var activeSchemas = await conn2.ExecuteScalarAsync<string[]>("select current_schemas(false)", transaction: tx2);
            var subClaim = await conn2.ExecuteScalarAsync<string>("select coalesce(current_setting('request.jwt.claim.sub', true), '')", transaction: tx2);

            Assert.Equal(backendPidTx1, backendPidTx2);
            Assert.Equal("bb_api", currentUser);
            Assert.Equal("", searchPath?.Trim('"'));
            Assert.Empty(activeSchemas!);
            Assert.Equal("", subClaim);

            await tx2.CommitAsync();
        }
    }

    // ───────────────────────── Brand Registry & Anonymous SessionContext Verification ─────────────────────────

    [Fact]
    public async Task ResolveBrand_Returns_Seeded_BabyBlue_Brand_And_Denies_Direct_Table_Access()
    {
        await using var dataSource = DataSourceFactory.Create(
            db.BbApiConnectionString,
            allowInsecureSslForLocalTesting: true,
            maxPoolSize: 2,
            minPoolSize: 0);

        await using var conn = await dataSource.OpenConnectionAsync();
        await using var tx = await conn.BeginTransactionAsync();

        var anonCaller = new CallerContext(
            UserId: null,
            DbRole: DbRole.Anonymous,
            ClaimsJson: string.Empty,
            Brand: CreateBrand("public"),
            RequestId: "req-anon-brand");

        await SessionContext.ApplyAsync(conn, tx, anonCaller, CancellationToken.None);

        var timeout = await conn.ExecuteScalarAsync<string>("select current_setting('statement_timeout')", transaction: tx);
        Assert.Equal("5s", timeout);

        var brand = await conn.QuerySingleOrDefaultAsync<ResolvedBrand>(
            "select * from public.resolve_brand(p_host => @Host)",
            new { Host = "babyblue.co.za" },
            transaction: tx);

        Assert.NotNull(brand);
        Assert.Equal("babyblue", brand.Slug);
        Assert.Equal("public", brand.SchemaName);
        Assert.Equal("active", brand.Status);
        Assert.True(brand.IsFeatureEnabled("booking", defaultValue: false));
        Assert.True(brand.IsFeatureEnabled("growth", defaultValue: false));
        Assert.False(brand.IsFeatureEnabled("clinical", defaultValue: true));

        var unknownBrand = await conn.QuerySingleOrDefaultAsync<ResolvedBrand>(
            "select * from public.resolve_brand(p_host => @Host)",
            new { Host = "unknown.example.com" },
            transaction: tx);
        Assert.Null(unknownBrand);

        // Direct read on tenant_brands is denied to anon/authenticated:
        var directReadEx = await Assert.ThrowsAsync<PostgresException>(
            () => conn.ExecuteScalarAsync<int>("select count(*) from public.tenant_brands", transaction: tx));
        Assert.Equal("42501", directReadEx.SqlState);

        await tx.RollbackAsync();
    }
}
