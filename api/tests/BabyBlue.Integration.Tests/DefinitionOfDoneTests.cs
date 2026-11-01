using System.Reflection;
using BabyBlue.Data;
using BabyBlue.Integration.Tests.Fixtures;
using Microsoft.AspNetCore.Mvc.ApiExplorer;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace BabyBlue.Integration.Tests;

/// <summary>
/// The parts of the §26 Definition of Done that a test can decide, as opposed to the parts that
/// need a staging environment (the six alerts, the load-test budget) or an operator (the Stage 5
/// revoke).
/// </summary>
[Collection(PostgresDatabaseCollection.Name)]
public sealed class DefinitionOfDoneTests(PostgresDatabaseFixture db)
{
    /// <summary>
    /// Every one of the 106 procedures is reachable over HTTP, and nothing else is.
    ///
    /// Counting routes from the running application rather than from the source catches the two
    /// failures a grep cannot: a controller that compiles but is never discovered, and a route
    /// added without a procedure behind it. §6's first assertion is the mirror of this on the
    /// database side — a procedure with no route is invisible, a route with no procedure is a 500.
    /// </summary>
    [Fact]
    public async Task All106Procedures_AreRoutedUnderV1_AndTheCountsAgree()
    {
        await using var factory = new BabyBlueApiFactory(db.BbApiConnectionString);
        using var client = factory.CreateDefaultHostClient("babyblue.co.za");
        _ = client; // force the host to build and discover controllers

        var apiExplorer = factory.Services.GetRequiredService<IApiDescriptionGroupCollectionProvider>();
        var routes = apiExplorer.ApiDescriptionGroups.Items
            .SelectMany(g => g.Items)
            .Select(d => $"{d.HttpMethod} /{d.RelativePath}")
            .Distinct(StringComparer.Ordinal)
            .ToArray();

        var catalogueSize = typeof(ProcedureName).Assembly
            .GetType("BabyBlue.Data.Generated.Procedures")!
            .GetFields(BindingFlags.Public | BindingFlags.Static)
            .Count(f => f.FieldType == typeof(ProcedureName));

        Assert.Equal(106, catalogueSize);
        Assert.Equal(catalogueSize, routes.Length);
        Assert.All(routes, r => Assert.Contains("/v1/", r, StringComparison.Ordinal));
    }

    /// <summary>
    /// §18: the Supabase <c>service_role</c> key never enters this process. <c>/api/leads</c> stays
    /// in Next.js precisely so that it does not have to. A key that is present can be used by
    /// accident, and `service_role` bypasses RLS entirely, which would undo the whole posture.
    /// </summary>
    [Fact]
    public async Task NoServiceRoleKey_IsPresentInConfiguration()
    {
        await using var factory = new BabyBlueApiFactory(db.BbApiConnectionString);
        using var client = factory.CreateDefaultHostClient("babyblue.co.za");
        _ = client;

        var configuration = factory.Services.GetRequiredService<IConfiguration>();
        var offenders = configuration.AsEnumerable()
            .Where(kv => kv.Key.Contains("service_role", StringComparison.OrdinalIgnoreCase)
                      || kv.Key.Contains("ServiceRole", StringComparison.Ordinal)
                      || (kv.Value?.Contains("service_role", StringComparison.OrdinalIgnoreCase) ?? false))
            .Select(kv => kv.Key)
            .ToArray();

        Assert.Empty(offenders);
    }

    /// <summary>
    /// §4: <c>bb_api</c> connects with no authority of its own. Asserted here as well as at
    /// startup because the startup check runs against whatever the deployment points at, and this
    /// one runs against the migrations as committed.
    /// </summary>
    [Fact]
    public async Task BbApi_HasNoTableAuthority_AndCannotReachServiceRole()
    {
        await using var conn = new Npgsql.NpgsqlConnection(db.BbApiConnectionString);
        await conn.OpenAsync();

        await using var cmd = new Npgsql.NpgsqlCommand(
            """
            select
              (select count(*) from pg_class c
                join pg_namespace n on n.oid = c.relnamespace
                join pg_roles r on r.oid = c.relowner
               where r.rolname = 'bb_api' and n.nspname not in ('pg_catalog', 'information_schema'))
                as owned_objects,
              (select count(*) from information_schema.table_privileges
               where grantee = 'bb_api') as direct_table_grants,
              pg_has_role(current_user, 'service_role', 'member') as can_assume_service_role,
              (select rolbypassrls from pg_roles where rolname = current_user) as bypass_rls,
              (select rolinherit from pg_roles where rolname = current_user) as inherit
            """,
            conn);

        await using var reader = await cmd.ExecuteReaderAsync();
        Assert.True(await reader.ReadAsync());

        Assert.Equal(0, reader.GetInt64(0));
        Assert.Equal(0, reader.GetInt64(1));
        Assert.False(reader.GetBoolean(2));
        Assert.False(reader.GetBoolean(3));
        Assert.False(reader.GetBoolean(4));
    }

    /// <summary>
    /// §6 assertion 2, checked from the database rather than only from the generator: no function
    /// in the brand schema is executable by <c>PUBLIC</c>. The generator refuses to emit if this
    /// fails; this proves the migrations as committed satisfy it, with no generator run involved.
    /// </summary>
    [Fact]
    public async Task NoFunctionInThePublicSchema_IsExecutableByPUBLIC()
    {
        await using var conn = new Npgsql.NpgsqlConnection(db.SuperuserConnectionString);
        await conn.OpenAsync();

        await using var cmd = new Npgsql.NpgsqlCommand(
            """
            select coalesce(string_agg(p.proname, ', ' order by p.proname), '')
              from pg_proc p
              join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public'
               and (p.proacl is null or array_to_string(p.proacl, ',') ~ '(^|,)=X/')
               and not exists (
                 select 1 from pg_depend d
                  where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
            """,
            conn);

        var offenders = (string?)await cmd.ExecuteScalarAsync() ?? "";
        Assert.Equal("", offenders);
    }
}
