using System.Collections.Concurrent;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using BabyBlue.Integration.Tests.Fixtures;
using Dapper;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Npgsql;
using Xunit;

namespace BabyBlue.Integration.Tests;

[Collection(PostgresDatabaseCollection.Name)]
public sealed class Phase2PublicEndpointsTests(PostgresDatabaseFixture db)
{
    private static readonly HashSet<string> ProhibitedPersonalKeys = new(StringComparer.OrdinalIgnoreCase)
    {
        "email",
        "phone",
        "full_name",
        "first_name",
        "last_name",
        "admin_notes",
        "registration_number",
        "user_id",
        "client_id",
    };

    [Fact]
    public async Task All10PublicEndpoints_Succeed_For_Anonymous_And_Authenticated_And_Expose_Zero_Pii()
    {
        await using var factory = new BabyBlueApiFactory(db.BbApiConnectionString);
        using var client = factory.CreateDefaultHostClient("babyblue.co.za");

        var authToken = JwtTestTokenBuilder.CreateToken(PostgresDatabaseFixture.Consumer1);
        var fromDate = DateOnly.FromDateTime(DateTime.UtcNow).ToString("yyyy-MM-dd");
        var toDate = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(7)).ToString("yyyy-MM-dd");

        foreach (var isAuthenticated in new[] { false, true })
        {
            HttpRequestMessage CreateReq(HttpMethod method, string url, object? body = null)
            {
                var req = new HttpRequestMessage(method, url);
                if (isAuthenticated)
                {
                    req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", authToken);
                }
                if (body is not null)
                {
                    req.Content = JsonContent.Create(body);
                }
                return req;
            }

            // 1. GET /v1/directory/practitioners
            using (var res = await client.SendAsync(CreateReq(HttpMethod.Get, "/v1/directory/practitioners?limit=10")))
            {
                Assert.Equal(HttpStatusCode.OK, res.StatusCode);
                var json = await res.Content.ReadFromJsonAsync<JsonElement>();
                AssertNoProhibitedKeys(json, "/v1/directory/practitioners");
            }

            // 2. GET /v1/directory/practitioners/{id}
            using (var res = await client.SendAsync(CreateReq(HttpMethod.Get, $"/v1/directory/practitioners/{PostgresDatabaseFixture.PractitionerA}")))
            {
                Assert.Equal(HttpStatusCode.OK, res.StatusCode);
                var json = await res.Content.ReadFromJsonAsync<JsonElement>();
                AssertNoProhibitedKeys(json, "/v1/directory/practitioners/{id}");
            }

            // 3. GET /v1/directory/practitioners/{id}/services
            using (var res = await client.SendAsync(CreateReq(HttpMethod.Get, $"/v1/directory/practitioners/{PostgresDatabaseFixture.PractitionerA}/services")))
            {
                Assert.Equal(HttpStatusCode.OK, res.StatusCode);
                var json = await res.Content.ReadFromJsonAsync<JsonElement>();
                AssertNoProhibitedKeys(json, "/v1/directory/practitioners/{id}/services");
            }

            // 4. GET /v1/directory/practitioners/{id}/slots
            using (var res = await client.SendAsync(CreateReq(HttpMethod.Get, $"/v1/directory/practitioners/{PostgresDatabaseFixture.PractitionerA}/slots?service={PostgresDatabaseFixture.ServiceA}&from={fromDate}&to={toDate}")))
            {
                Assert.Equal(HttpStatusCode.OK, res.StatusCode);
                Assert.Equal("no-store", res.Headers.CacheControl?.ToString());
                var json = await res.Content.ReadFromJsonAsync<JsonElement>();
                AssertNoProhibitedKeys(json, "/v1/directory/practitioners/{id}/slots");
            }

            // 5. GET /v1/directory/cities
            using (var res = await client.SendAsync(CreateReq(HttpMethod.Get, "/v1/directory/cities")))
            {
                Assert.Equal(HttpStatusCode.OK, res.StatusCode);
                var json = await res.Content.ReadFromJsonAsync<JsonElement>();
                AssertNoProhibitedKeys(json, "/v1/directory/cities");
            }

            // 6. GET /v1/directory/specialities
            using (var res = await client.SendAsync(CreateReq(HttpMethod.Get, "/v1/directory/specialities")))
            {
                Assert.Equal(HttpStatusCode.OK, res.StatusCode);
                var json = await res.Content.ReadFromJsonAsync<JsonElement>();
                AssertNoProhibitedKeys(json, "/v1/directory/specialities");
            }

            // 7. GET /v1/queue/{slug}
            using (var res = await client.SendAsync(CreateReq(HttpMethod.Get, "/v1/queue/practice-a")))
            {
                Assert.Equal(HttpStatusCode.OK, res.StatusCode);
                var json = await res.Content.ReadFromJsonAsync<JsonElement>();
                AssertNoProhibitedKeys(json, "/v1/queue/practice-a");
            }

            // 8. POST /v1/queue/{slug}/join
            string queueToken;
            using (var res = await client.SendAsync(CreateReq(HttpMethod.Post, "/v1/queue/practice-a/join", new
            {
                full_name = "Thabo Mokoena",
                phone = "+27821234567",
                urgency = "routine",
            })))
            {
                Assert.Equal(HttpStatusCode.Created, res.StatusCode);
                var json = await res.Content.ReadFromJsonAsync<JsonElement>();
                AssertNoProhibitedKeys(json, "POST /v1/queue/practice-a/join");
                queueToken = json.GetProperty("token").GetString()!;
                Assert.False(string.IsNullOrWhiteSpace(queueToken));
            }

            // 9. GET /v1/queue/tokens/{token}
            using (var res = await client.SendAsync(CreateReq(HttpMethod.Get, $"/v1/queue/tokens/{queueToken}")))
            {
                Assert.Equal(HttpStatusCode.OK, res.StatusCode);
                Assert.Equal("no-store", res.Headers.CacheControl?.ToString());
                var json = await res.Content.ReadFromJsonAsync<JsonElement>();
                AssertNoProhibitedKeys(json, "GET /v1/queue/tokens/{token}");

                // Assert exact 3 keys per Finding F-12 / D-07: status, queue_position, practice_name
                var keys = json.EnumerateObject().Select(p => p.Name).OrderBy(k => k, StringComparer.Ordinal).ToArray();
                Assert.Equal(["practice_name", "queue_position", "status"], keys);
            }

            // 10. DELETE /v1/queue/tokens/{token}
            using (var res = await client.SendAsync(CreateReq(HttpMethod.Delete, $"/v1/queue/tokens/{queueToken}")))
            {
                Assert.Equal(HttpStatusCode.NoContent, res.StatusCode);
            }
        }
    }

    [Fact]
    public async Task PublicEndpoints_NotFound_And_QueueClosed_Return_Documented_ProblemCodes()
    {
        await using var factory = new BabyBlueApiFactory(db.BbApiConnectionString);
        using var client = factory.CreateDefaultHostClient("babyblue.co.za");

        // Unknown practitioner -> 404 not_found
        using (var res = await client.GetAsync($"/v1/directory/practitioners/{Guid.NewGuid()}"))
        {
            Assert.Equal(HttpStatusCode.NotFound, res.StatusCode);
            var body = await res.Content.ReadFromJsonAsync<JsonElement>();
            Assert.Equal("not_found", body.GetProperty("code").GetString());
        }

        // Unknown queue token -> 404 not_found
        using (var res = await client.GetAsync("/v1/queue/tokens/nonexistent_token_1234567890"))
        {
            Assert.Equal(HttpStatusCode.NotFound, res.StatusCode);
            var body = await res.Content.ReadFromJsonAsync<JsonElement>();
            Assert.Equal("not_found", body.GetProperty("code").GetString());
        }

        // Invalid slot date range (> 31 days) -> 400 invalid_range
        using (var res = await client.GetAsync($"/v1/directory/practitioners/{PostgresDatabaseFixture.PractitionerA}/slots?service={PostgresDatabaseFixture.ServiceA}&from=2026-01-01&to=2026-03-01"))
        {
            Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
            var body = await res.Content.ReadFromJsonAsync<JsonElement>();
            Assert.Equal("invalid_range", body.GetProperty("code").GetString());
        }

        // Closed queue -> 409 queue_closed
        await using (var adminConn = new NpgsqlConnection(db.SuperuserConnectionString))
        {
            await adminConn.OpenAsync();
            await adminConn.ExecuteAsync("update public.practices set status = 'suspended' where id = @Id",
                new { Id = PostgresDatabaseFixture.PracticeB });
        }

        try
        {
            using var res = await client.PostAsJsonAsync("/v1/queue/practice-b/join", new
            {
                full_name = "Walk In Patient",
                urgency = "routine",
            });
            Assert.Equal(HttpStatusCode.Conflict, res.StatusCode);
            var body = await res.Content.ReadFromJsonAsync<JsonElement>();
            Assert.Equal("queue_closed", body.GetProperty("code").GetString());
        }
        finally
        {
            await using var adminConn = new NpgsqlConnection(db.SuperuserConnectionString);
            await adminConn.OpenAsync();
            await adminConn.ExecuteAsync("update public.practices set status = 'active' where id = @Id",
                new { Id = PostgresDatabaseFixture.PracticeB });
        }
    }

    [Fact]
    public async Task OutputCache_Bypasses_Authenticated_Requests_And_Isolates_Brands()
    {
        await using var factory = new BabyBlueApiFactory(db.BbApiConnectionString);
        using var babyBlueClient = factory.CreateDefaultHostClient("babyblue.co.za");
        using var testBrandClient = factory.CreateDefaultHostClient("book.testbrand.co.za");

        var authToken = JwtTestTokenBuilder.CreateToken(PostgresDatabaseFixture.Consumer1);

        // 1. Authenticated GET /v1/directory/cities -> Cache-Control: no-store, never populates OutputCache
        using (var authReq = new HttpRequestMessage(HttpMethod.Get, "/v1/directory/cities"))
        {
            authReq.Headers.Authorization = new AuthenticationHeaderValue("Bearer", authToken);
            using var authRes = await babyBlueClient.SendAsync(authReq);
            Assert.Equal(HttpStatusCode.OK, authRes.StatusCode);
            Assert.Equal("no-store", authRes.Headers.CacheControl?.ToString());
            Assert.False(authRes.Headers.Contains("X-Cache"));
        }

        // 2. First anonymous GET /v1/directory/cities -> MISS, Cache-Control: public, max-age=3600
        using (var anonRes1 = await babyBlueClient.GetAsync("/v1/directory/cities"))
        {
            Assert.Equal(HttpStatusCode.OK, anonRes1.StatusCode);
            Assert.Equal("MISS", anonRes1.Headers.GetValues("X-Cache").Single());
            Assert.Contains("public", anonRes1.Headers.CacheControl?.ToString() ?? "");
        }

        // 3. Second anonymous GET /v1/directory/cities -> HIT from OutputCache
        using (var anonRes2 = await babyBlueClient.GetAsync("/v1/directory/cities"))
        {
            Assert.Equal(HttpStatusCode.OK, anonRes2.StatusCode);
            Assert.Equal("HIT", anonRes2.Headers.GetValues("X-Cache").Single());
        }

        // 4. Subsequent authenticated GET /v1/directory/cities -> still bypasses OutputCache and returns no-store
        using (var authReq2 = new HttpRequestMessage(HttpMethod.Get, "/v1/directory/cities"))
        {
            authReq2.Headers.Authorization = new AuthenticationHeaderValue("Bearer", authToken);
            using var authRes2 = await babyBlueClient.SendAsync(authReq2);
            Assert.Equal(HttpStatusCode.OK, authRes2.StatusCode);
            Assert.Equal("no-store", authRes2.Headers.CacheControl?.ToString());
            Assert.False(authRes2.Headers.Contains("X-Cache"));
        }

        // 5. Anonymous GET /v1/directory/cities on book.testbrand.co.za -> does NOT receive babyblue.co.za's cached response
        using (var brand2Res = await testBrandClient.GetAsync("/v1/directory/cities"))
        {
            Assert.Equal(HttpStatusCode.OK, brand2Res.StatusCode);
            Assert.Equal("MISS", brand2Res.Headers.GetValues("X-Cache").Single());
            var cities = await brand2Res.Content.ReadFromJsonAsync<List<JsonElement>>();
            Assert.NotNull(cities);
            Assert.Equal("testbrand-city", Assert.Single(cities).GetProperty("slug").GetString());
        }
    }

    [Fact]
    public async Task RateLimiting_Enforces_QueueJoin_3PerHour_And_DirectorySearch_60PerMin()
    {
        await using var factory = new BabyBlueApiFactory(db.BbApiConnectionString);
        using var client = factory.CreateDefaultHostClient("babyblue.co.za");

        // 1. QueueJoin: 3 permits / hour / brand+IP -> 4th returns 429 rate_limited + Retry-After
        for (var i = 1; i <= 3; i++)
        {
            using var okRes = await client.PostAsJsonAsync("/v1/queue/practice-a/join", new
            {
                full_name = $"Queue User {i}",
                urgency = "routine",
            });
            Assert.Equal(HttpStatusCode.Created, okRes.StatusCode);
        }

        using (var rejectedRes = await client.PostAsJsonAsync("/v1/queue/practice-a/join", new
        {
            full_name = "Queue User 4",
            urgency = "routine",
        }))
        {
            Assert.Equal(HttpStatusCode.TooManyRequests, rejectedRes.StatusCode);
            Assert.NotNull(rejectedRes.Headers.RetryAfter);
            var body = await rejectedRes.Content.ReadFromJsonAsync<JsonElement>();
            Assert.Equal("rate_limited", body.GetProperty("code").GetString());
        }

        // 2. DirectorySearch: 60 permits / min / brand+IP -> 61st returns 429 rate_limited
        for (var i = 1; i <= 60; i++)
        {
            using var okRes = await client.GetAsync("/v1/directory/practitioners");
            Assert.Equal(HttpStatusCode.OK, okRes.StatusCode);
        }

        using (var rejectedSearch = await client.GetAsync("/v1/directory/practitioners"))
        {
            Assert.Equal(HttpStatusCode.TooManyRequests, rejectedSearch.StatusCode);
            var body = await rejectedSearch.Content.ReadFromJsonAsync<JsonElement>();
            Assert.Equal("rate_limited", body.GetProperty("code").GetString());
        }
    }

    [Fact]
    public async Task QueueToken_AccessLog_Is_Completely_Redacted()
    {
        var logSink = new ConcurrentQueue<string>();

        await using var factory = new BabyBlueApiFactory(db.BbApiConnectionString)
            .WithWebHostBuilder(b =>
            {
                b.ConfigureLogging(logging =>
                {
                    logging.AddProvider(new InMemoryLogProvider(logSink));
                });
            });

        using var client = factory.CreateDefaultHostClient("babyblue.co.za");
        const string secretToken = "secret_token_9876543210";

        using var res = await client.GetAsync($"/v1/queue/tokens/{secretToken}");
        Assert.Equal(HttpStatusCode.NotFound, res.StatusCode);

        foreach (var entry in logSink)
        {
            Assert.DoesNotContain(secretToken, entry, StringComparison.OrdinalIgnoreCase);
        }
    }

    private static void AssertNoProhibitedKeys(JsonElement element, string context)
    {
        switch (element.ValueKind)
        {
            case JsonValueKind.Object:
                foreach (var prop in element.EnumerateObject())
                {
                    Assert.False(
                        ProhibitedPersonalKeys.Contains(prop.Name),
                        $"Public endpoint '{context}' leaked prohibited personal field '{prop.Name}'.");
                    AssertNoProhibitedKeys(prop.Value, $"{context}.{prop.Name}");
                }
                break;
            case JsonValueKind.Array:
                foreach (var item in element.EnumerateArray())
                {
                    AssertNoProhibitedKeys(item, context);
                }
                break;
        }
    }

    private sealed class InMemoryLogProvider(ConcurrentQueue<string> sink) : ILoggerProvider
    {
        public ILogger CreateLogger(string categoryName) => new InMemoryLogger(categoryName, sink);
        public void Dispose() { }
    }

    private sealed class InMemoryLogger(string category, ConcurrentQueue<string> sink) : ILogger
    {
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
        public bool IsEnabled(LogLevel logLevel) => true;

        public void Log<TState>(
            LogLevel logLevel,
            EventId eventId,
            TState state,
            Exception? exception,
            Func<TState, Exception?, string> formatter)
        {
            sink.Enqueue($"[{category}] {formatter(state, exception)}");
        }
    }
}
