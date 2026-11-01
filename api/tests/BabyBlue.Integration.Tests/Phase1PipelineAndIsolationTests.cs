using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using BabyBlue.Data;
using BabyBlue.Data.Generated;
using BabyBlue.Integration.Tests.Fixtures;
using Dapper;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using Xunit;

namespace BabyBlue.Integration.Tests;

[Collection(PostgresDatabaseCollection.Name)]
public sealed class Phase1PipelineAndIsolationTests(PostgresDatabaseFixture db)
{
    [Fact]
    public async Task SingleConnection_PoolIsolation_CrossUser_CrossRole_And_PostRequest_CleanState()
    {
        await using var factory = new BabyBlueApiFactory(db.BbApiConnectionString, maxPoolSize: 1, minPoolSize: 1);
        using var client = factory.CreateDefaultHostClient("babyblue.co.za");

        var ownerAToken = JwtTestTokenBuilder.CreateToken(PostgresDatabaseFixture.OwnerA);
        var ownerBToken = JwtTestTokenBuilder.CreateToken(PostgresDatabaseFixture.OwnerB);

        // 1. GET /v1/practices with ownerA's JWT -> [practiceA]
        using (var reqA = new HttpRequestMessage(HttpMethod.Get, "/v1/practices"))
        {
            reqA.Headers.Authorization = new AuthenticationHeaderValue("Bearer", ownerAToken);
            using var resA = await client.SendAsync(reqA);
            Assert.Equal(HttpStatusCode.OK, resA.StatusCode);

            var rowsA = await resA.Content.ReadFromJsonAsync<List<JsonElement>>();
            Assert.NotNull(rowsA);
            var singleA = Assert.Single(rowsA);
            Assert.Equal(PostgresDatabaseFixture.PracticeA.ToString(), singleA.GetProperty("practice_id").GetString());
        }

        // 2. Immediately GET /v1/practices with ownerB's JWT on the same size-1 pool -> [practiceB], never practiceA
        using (var reqB = new HttpRequestMessage(HttpMethod.Get, "/v1/practices"))
        {
            reqB.Headers.Authorization = new AuthenticationHeaderValue("Bearer", ownerBToken);
            using var resB = await client.SendAsync(reqB);
            Assert.Equal(HttpStatusCode.OK, resB.StatusCode);

            var rowsB = await resB.Content.ReadFromJsonAsync<List<JsonElement>>();
            Assert.NotNull(rowsB);
            var singleB = Assert.Single(rowsB);
            Assert.Equal(PostgresDatabaseFixture.PracticeB.ToString(), singleB.GetProperty("practice_id").GetString());
        }

        // 3. Immediately GET /v1/directory/cities anonymously -> runs as anon, not ownerB
        using (var reqAnon = new HttpRequestMessage(HttpMethod.Get, "/v1/directory/cities"))
        {
            using var resAnon = await client.SendAsync(reqAnon);
            Assert.Equal(HttpStatusCode.OK, resAnon.StatusCode);

            var cities = await resAnon.Content.ReadFromJsonAsync<List<JsonElement>>();
            Assert.NotNull(cities);
            Assert.Contains(cities, c => c.GetProperty("slug").GetString() == "johannesburg");
        }

        // 4. Open the single connection directly from the pool and assert session state is completely unwound
        var dataSource = factory.Services.GetRequiredService<NpgsqlDataSource>();
        await using var conn = await dataSource.OpenConnectionAsync();
        await using var tx = await conn.BeginTransactionAsync();

        var currentUser = await conn.ExecuteScalarAsync<string>("select current_user", transaction: tx);
        var searchPath = await conn.ExecuteScalarAsync<string>("select current_setting('search_path')", transaction: tx);
        var subClaim = await conn.ExecuteScalarAsync<string>("select coalesce(current_setting('request.jwt.claim.sub', true), '')", transaction: tx);

        Assert.Equal("bb_api", currentUser);
        Assert.Equal("", searchPath?.Trim('"'));
        Assert.Equal("", subClaim);

        await tx.CommitAsync();
    }

    [Fact]
    public async Task SingleConnection_PoolIsolation_CrossBrand_Between_Public_And_BbTestBrand()
    {
        await using var factory = new BabyBlueApiFactory(db.BbApiConnectionString, maxPoolSize: 1, minPoolSize: 1);
        using var babyBlueClient = factory.CreateDefaultHostClient("babyblue.co.za");
        using var testBrandClient = factory.CreateDefaultHostClient("book.testbrand.co.za");

        var ownerAToken = JwtTestTokenBuilder.CreateToken(PostgresDatabaseFixture.OwnerA);
        var ownerBToken = JwtTestTokenBuilder.CreateToken(PostgresDatabaseFixture.OwnerB);

        // 1. GET /v1/practices on babyblue.co.za with ownerA's JWT -> [practiceA]
        using (var req1 = new HttpRequestMessage(HttpMethod.Get, "/v1/practices"))
        {
            req1.Headers.Authorization = new AuthenticationHeaderValue("Bearer", ownerAToken);
            using var res1 = await babyBlueClient.SendAsync(req1);
            Assert.Equal(HttpStatusCode.OK, res1.StatusCode);

            var rows1 = await res1.Content.ReadFromJsonAsync<List<JsonElement>>();
            Assert.NotNull(rows1);
            var single1 = Assert.Single(rows1);
            Assert.Equal(PostgresDatabaseFixture.PracticeA.ToString(), single1.GetProperty("practice_id").GetString());
        }

        // 2. Immediately GET /v1/practices on book.testbrand.co.za with ownerA's JWT -> [] (zero rows, not an error)
        using (var req2 = new HttpRequestMessage(HttpMethod.Get, "/v1/practices"))
        {
            req2.Headers.Authorization = new AuthenticationHeaderValue("Bearer", ownerAToken);
            using var res2 = await testBrandClient.SendAsync(req2);
            Assert.Equal(HttpStatusCode.OK, res2.StatusCode);

            var rows2 = await res2.Content.ReadFromJsonAsync<List<JsonElement>>();
            Assert.NotNull(rows2);
            Assert.Empty(rows2);
        }

        // 3. Prove search_path observed inside book.testbrand.co.za is bb_testbrand and not public:
        //    ownerB sees PracticeB2 (seeded only in bb_testbrand), and /v1/directory/cities returns testbrand-city.
        using (var req3 = new HttpRequestMessage(HttpMethod.Get, "/v1/practices"))
        {
            req3.Headers.Authorization = new AuthenticationHeaderValue("Bearer", ownerBToken);
            using var res3 = await testBrandClient.SendAsync(req3);
            Assert.Equal(HttpStatusCode.OK, res3.StatusCode);

            var rows3 = await res3.Content.ReadFromJsonAsync<List<JsonElement>>();
            Assert.NotNull(rows3);
            var single3 = Assert.Single(rows3);
            Assert.Equal(PostgresDatabaseFixture.PracticeB2.ToString(), single3.GetProperty("practice_id").GetString());
        }

        using (var reqCities = new HttpRequestMessage(HttpMethod.Get, "/v1/directory/cities"))
        {
            using var resCities = await testBrandClient.SendAsync(reqCities);
            Assert.Equal(HttpStatusCode.OK, resCities.StatusCode);

            var cities = await resCities.Content.ReadFromJsonAsync<List<JsonElement>>();
            Assert.NotNull(cities);
            var city = Assert.Single(cities);
            Assert.Equal("testbrand-city", city.GetProperty("slug").GetString());
        }
    }

    [Fact]
    public async Task UnknownHost_Returns_404_BrandNotFound_Even_With_Valid_Jwt()
    {
        await using var factory = new BabyBlueApiFactory(db.BbApiConnectionString, maxPoolSize: 2);
        using var unknownClient = factory.CreateDefaultHostClient("unknown.example.com");

        var ownerAToken = JwtTestTokenBuilder.CreateToken(PostgresDatabaseFixture.OwnerA);
        using var req = new HttpRequestMessage(HttpMethod.Get, "/v1/practices");
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", ownerAToken);

        using var res = await unknownClient.SendAsync(req);
        Assert.Equal(HttpStatusCode.NotFound, res.StatusCode);

        var problem = await res.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("brand_not_found", problem.GetProperty("code").GetString());
    }

    [Fact]
    public async Task ServiceRole_Jwt_Claim_Is_Downgraded_To_Authenticated_DbRole()
    {
        await using var factory = new BabyBlueApiFactory(db.BbApiConnectionString, maxPoolSize: 2);
        using var client = factory.CreateDefaultHostClient("babyblue.co.za");

        // Consumer1 has no practice memberships; even if a token carries role="service_role",
        // CallerContextMiddleware ignores the JWT role claim and sets DbRole.Authenticated.
        var forgedServiceRoleToken = JwtTestTokenBuilder.CreateToken(
            PostgresDatabaseFixture.Consumer1,
            role: "service_role");

        using var req = new HttpRequestMessage(HttpMethod.Get, "/v1/practices");
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", forgedServiceRoleToken);

        using var res = await client.SendAsync(req);
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);

        var practices = await res.Content.ReadFromJsonAsync<List<JsonElement>>();
        Assert.NotNull(practices);
        Assert.Empty(practices);
    }

    [Fact]
    public async Task StatementTimeout_57014_Maps_To_504_GatewayTimeout()
    {
        var pgEx = new PostgresException(
            messageText: "canceling statement due to statement timeout",
            severity: "ERROR",
            invariantSeverity: "ERROR",
            sqlState: "57014");

        var (status, code, _) = BabyBlue.Api.Middleware.ProblemDetailsExceptionHandler.Classify(pgEx);
        Assert.Equal(504, status);
        Assert.Equal("statement_timeout", code);

        // Also verify against real PostgreSQL that exceeding statement_timeout raises 57014
        await using var dataSource = BabyBlue.Data.Npgsql.DataSourceFactory.Create(
            db.BbApiConnectionString,
            allowInsecureSslForLocalTesting: true,
            maxPoolSize: 1);
        await using var conn = await dataSource.OpenConnectionAsync();
        await using var tx = await conn.BeginTransactionAsync();

        await conn.ExecuteAsync("set local statement_timeout = '50ms'", transaction: tx);
        var realPgEx = await Assert.ThrowsAsync<PostgresException>(
            () => conn.ExecuteAsync("select pg_sleep(0.5)", transaction: tx));
        Assert.Equal("57014", realPgEx.SqlState);

        var classified = BabyBlue.Api.Middleware.ProblemDetailsExceptionHandler.Classify(realPgEx);
        Assert.Equal(504, classified.Status);
        Assert.Equal("statement_timeout", classified.Code);
    }

    [Fact]
    public async Task CrossOrigin_Error_Response_Preserves_Cors_And_Security_Headers()
    {
        // Configure bb_testbrand to have a function that raises `slot_unavailable` (409) so we can trigger
        // ProblemDetailsExceptionHandler across the full HTTP pipeline with an Origin header.
        await using (var adminConn = new NpgsqlConnection(db.SuperuserConnectionString))
        {
            await adminConn.OpenAsync();
            await adminConn.ExecuteAsync("""
                drop function if exists bb_testbrand.public_city_list();
                create or replace function bb_testbrand.public_city_list()
                returns table (city_id uuid, name text, slug text, province text, practitioner_count int)
                language plpgsql stable security definer set search_path = bb_testbrand
                as $$
                begin
                  raise exception 'slot_unavailable' using errcode = '23P01';
                end $$;
                grant execute on function bb_testbrand.public_city_list() to anon, authenticated;
                """);
        }

        try
        {
            await using var factory = new BabyBlueApiFactory(db.BbApiConnectionString, maxPoolSize: 2);
            using var client = factory.CreateDefaultHostClient("book.testbrand.co.za");

            using var req = new HttpRequestMessage(HttpMethod.Get, "/v1/directory/cities");
            req.Headers.Add("Origin", "https://book.testbrand.co.za");
            req.Headers.Add("X-Request-Id", "corr-test-409");

            using var res = await client.SendAsync(req);
            Assert.Equal(HttpStatusCode.Conflict, res.StatusCode);

            Assert.Equal("https://book.testbrand.co.za", res.Headers.GetValues("Access-Control-Allow-Origin").Single());
            Assert.Equal("nosniff", res.Headers.GetValues("X-Content-Type-Options").Single());
            Assert.Equal("corr-test-409", res.Headers.GetValues("X-Request-Id").Single());

            var problem = await res.Content.ReadFromJsonAsync<JsonElement>();
            Assert.Equal("slot_unavailable", problem.GetProperty("code").GetString());
            Assert.Equal("corr-test-409", problem.GetProperty("request_id").GetString());
        }
        finally
        {
            await using var adminConn = new NpgsqlConnection(db.SuperuserConnectionString);
            await adminConn.OpenAsync();
            await adminConn.ExecuteAsync("""
                create or replace function bb_testbrand.public_city_list()
                returns table (city_id uuid, name text, slug text, province text, practitioner_count int)
                language sql stable security definer set search_path = bb_testbrand
                as $$
                  select '00000000-0000-4000-8000-000000000801'::uuid,
                         'TestBrand City'::text,
                         'testbrand-city'::text,
                         'Western Cape'::text,
                         1::int;
                $$;
                grant execute on function bb_testbrand.public_city_list() to anon, authenticated;
                """);
        }
    }
}
