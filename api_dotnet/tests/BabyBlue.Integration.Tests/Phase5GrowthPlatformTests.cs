using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using BabyBlue.Integration.Tests.Fixtures;
using Dapper;
using Npgsql;
using Xunit;

namespace BabyBlue.Integration.Tests;

/// <summary>
/// Phase 5 gates: Growth, Platform admin, binary streaming, and the parts of the Definition of
/// Done that are assertable in code rather than in a dashboard.
/// </summary>
[Collection(PostgresDatabaseCollection.Name)]
public sealed class Phase5GrowthPlatformTests(PostgresDatabaseFixture db)
{
    private static readonly Guid PracticeA = PostgresDatabaseFixture.PracticeA;
    private static readonly Guid PractitionerA = PostgresDatabaseFixture.PractitionerA;

    /// <summary>All 16 Growth routes, used by the feature-flag gate.</summary>
    private static IEnumerable<(HttpMethod Method, string Path, object? Body)> GrowthRoutes(Guid practice)
    {
        var any = Guid.Parse("00000000-0000-4000-8000-0000000000fe");

        yield return (HttpMethod.Get, "/v1/growth/services", null);
        yield return (HttpMethod.Get, $"/v1/practices/{practice}/growth/requests", null);
        yield return (HttpMethod.Post, $"/v1/practices/{practice}/growth/requests",
            new { service_id = any, title = "A brief", brief = "Please help us grow." });
        yield return (HttpMethod.Get, $"/v1/growth/requests/{any}", null);
        yield return (HttpMethod.Put, $"/v1/growth/requests/{any}/status", new { status = "submitted" });
        yield return (HttpMethod.Get, $"/v1/growth/requests/{any}/updates", null);
        yield return (HttpMethod.Post, $"/v1/growth/requests/{any}/updates", new { body = "An update." });
        yield return (HttpMethod.Get, $"/v1/growth/requests/{any}/approvals", null);
        yield return (HttpMethod.Post, $"/v1/growth/requests/{any}/approvals", new { item = "Logo v1" });
        yield return (HttpMethod.Post, $"/v1/growth/approvals/{any}/decide", new { status = "approved" });
        yield return (HttpMethod.Get, $"/v1/growth/requests/{any}/assets", null);
        yield return (HttpMethod.Post, $"/v1/growth/requests/{any}/assets", null); // multipart; sent separately
        yield return (HttpMethod.Get, $"/v1/growth/assets/{any}/content", null);
        yield return (HttpMethod.Get, $"/v1/growth/requests/{any}/reports", null);
        yield return (HttpMethod.Post, $"/v1/growth/requests/{any}/reports",
            new { period = "2026-10", summary = "A month." });
        yield return (HttpMethod.Get, "/v1/growth/inbox", null);
    }

    [Fact]
    public void GrowthRouteTable_Covers_All16Routes() =>
        Assert.Equal(16, GrowthRoutes(PracticeA).Count());

    /// <summary>
    /// §14: a brand that has not licensed Growth must receive <c>404</c>, never <c>403</c>.
    ///
    /// The difference matters. <c>403</c> says "this exists and you may not use it", which tells a
    /// tenant about a product they have not bought and makes the module enumerable across brands.
    /// <c>404</c> says nothing at all. `bb_testbrand` is seeded with an empty `features`
    /// document, so this also pins the decision that silence means off for a licensed add-on.
    /// </summary>
    [Fact]
    public async Task ABrandWithoutGrowth_Receives404_OnEvery_GrowthRoute_Never403()
    {
        await using var factory = new BabyBlueApiFactory(db.BbApiConnectionString);
        using var client = factory.CreateDefaultHostClient("book.testbrand.co.za");
        var token = JwtTestTokenBuilder.CreateToken(PostgresDatabaseFixture.OwnerB);

        var failures = new List<string>();

        foreach (var (method, path, body) in GrowthRoutes(PostgresDatabaseFixture.PracticeB))
        {
            using var req = new HttpRequestMessage(method, path);
            req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

            if (body is not null)
            {
                req.Content = JsonContent.Create(body);
            }
            else if (method == HttpMethod.Post && path.EndsWith("/assets", StringComparison.Ordinal))
            {
                req.Content = MultipartAsset("probe.txt", "text/plain", [1, 2, 3], "brief_asset");
            }

            using var resp = await client.SendAsync(req);
            if (resp.StatusCode != HttpStatusCode.NotFound)
            {
                failures.Add($"{method} {path} -> {(int)resp.StatusCode}");
            }
        }

        Assert.True(failures.Count == 0,
            $"{failures.Count} Growth route(s) leaked their existence:\n{string.Join("\n", failures)}");
    }

    /// <summary>
    /// The five Platform routes refuse anyone who is not a platform admin. `ownerA` is a genuine
    /// practice owner, which is exactly the caller who must not be able to suspend practices or
    /// award verification badges.
    /// </summary>
    [Fact]
    public async Task PlatformRoutes_RejectANonAdmin_With403Forbidden()
    {
        await using var factory = new BabyBlueApiFactory(db.BbApiConnectionString);
        using var client = factory.CreateDefaultHostClient("babyblue.co.za");
        var ownerAToken = JwtTestTokenBuilder.CreateToken(PostgresDatabaseFixture.OwnerA);

        (HttpMethod Method, string Path, object? Body)[] routes =
        [
            (HttpMethod.Get, "/v1/platform/overview", null),
            (HttpMethod.Get, "/v1/platform/audit-log", null),
            (HttpMethod.Post, "/v1/platform/roles",
                new { email = "owner-b@example.test", role = "marketing_operator" }),
            (HttpMethod.Put, $"/v1/platform/practices/{PracticeA}/status",
                new { status = "suspended", reason = "should not happen" }),
            (HttpMethod.Put, $"/v1/platform/practitioners/{PractitionerA}/verification",
                new { status = "verified", note = "should not happen" }),
        ];

        var failures = new List<string>();
        foreach (var (method, path, body) in routes)
        {
            using var req = new HttpRequestMessage(method, path);
            req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", ownerAToken);
            if (body is not null)
            {
                req.Content = JsonContent.Create(body);
            }

            using var resp = await client.SendAsync(req);
            var payload = await resp.Content.ReadAsStringAsync();
            if (resp.StatusCode != HttpStatusCode.Forbidden)
            {
                failures.Add($"{method} {path} -> {(int)resp.StatusCode} {payload}");
            }
        }

        Assert.True(failures.Count == 0, string.Join("\n", failures));

        // And nothing happened: the practice is still active and the practitioner unverified.
        await using var conn = new NpgsqlConnection(db.SuperuserConnectionString);
        Assert.Equal("active", await conn.ExecuteScalarAsync<string>(
            "select status from public.practices where id = @p", new { p = PracticeA }));
    }

    /// <summary>
    /// A real platform admin gets through, and the audit log pages by keyset.
    ///
    /// Keyset rather than offset because the audit log only ever grows: an offset page re-reads
    /// and discards everything above it, so page N gets slower as the log fills, and rows
    /// arriving mid-pagination shift the window so entries are skipped or repeated. `before` is
    /// the oldest timestamp already seen, which makes the next page an index range scan and
    /// immune to concurrent writes.
    /// </summary>
    [Fact]
    public async Task PlatformAdmin_ReadsOverview_And_PagesTheAuditLogByKeyset()
    {
        await using var factory = new BabyBlueApiFactory(db.BbApiConnectionString);
        using var client = factory.CreateDefaultHostClient("babyblue.co.za");

        var admin = Guid.NewGuid();
        await using var conn = new NpgsqlConnection(db.SuperuserConnectionString);
        await conn.OpenAsync();
        await conn.ExecuteAsync(
            """
            insert into auth.users (id, email) values (@id, @email);
            insert into public.profiles (id, display_name) values (@id, 'Platform Admin')
            on conflict (id) do nothing;
            insert into public.platform_roles (user_id, role) values (@id, 'platform_admin')
            on conflict (user_id) do update set role = 'platform_admin';
            """,
            new { id = admin, email = $"admin-{admin:N}@example.test" });

        var token = JwtTestTokenBuilder.CreateToken(admin);

        try
        {
            using (var overview = await SendAsync(client, token, HttpMethod.Get, "/v1/platform/overview", null))
            {
                Assert.Equal(HttpStatusCode.OK, overview.StatusCode);
            }

            // `GET /v1/me/platform-role` is open to every signed-in user and reports this one.
            using (var role = await SendAsync(client, token, HttpMethod.Get, "/v1/me/platform-role", null))
            {
                Assert.Equal(HttpStatusCode.OK, role.StatusCode);
                using var doc = JsonDocument.Parse(await role.Content.ReadAsStringAsync());
                Assert.Equal("platform_admin", doc.RootElement.GetProperty("role").GetString());
            }

            // Generate audit entries by doing something auditable.
            await conn.ExecuteAsync(
                """
                insert into public.audit_log (practice_id, actor_id, action, entity, entity_id, meta, at)
                select @practice, @admin, 'test.entry', 'practice', @practice, '{}'::jsonb,
                       now() - (g || ' minutes')::interval
                  from generate_series(1, 5) g;
                """,
                new { practice = PracticeA, admin });

            var firstPage = await ReadAuditPageAsync(client, token, limit: 3, before: null);
            Assert.Equal(3, firstPage.Count);

            // Strictly descending by time, which is what makes `before` a valid cursor.
            Assert.True(firstPage.Zip(firstPage.Skip(1)).All(pair => pair.First >= pair.Second));

            var secondPage = await ReadAuditPageAsync(client, token, limit: 3, before: firstPage[^1]);

            // The cursor is exclusive, so no entry appears on both pages.
            Assert.DoesNotContain(secondPage, at => firstPage.Contains(at));
            Assert.All(secondPage, at => Assert.True(at < firstPage[^1]));
        }
        finally
        {
            await conn.ExecuteAsync(
                """
                delete from public.audit_log where action = 'test.entry';
                delete from public.platform_roles where user_id = @id;
                delete from auth.users where id = @id;
                """,
                new { id = admin });
        }
    }

    /// <summary>
    /// The asset round trip, and the four headers that stop a stored asset becoming stored XSS.
    ///
    /// An asset is arbitrary bytes uploaded by one tenant and fetched by another from a shared API
    /// origin. If it came back as <c>text/html</c> with <c>Content-Disposition: inline</c>, a
    /// malicious "deliverable" would execute on <c>api.babyblue.co.za</c> with whatever that
    /// origin can reach. So: allowlisted media type, <c>attachment</c>, <c>nosniff</c>,
    /// <c>no-store</c> — and this test asserts an HTML upload is downgraded to
    /// <c>application/octet-stream</c> rather than trusting the uploader's declared type.
    /// </summary>
    [Fact]
    public async Task AssetRoundTrip_DownloadsAsAnAttachment_AndDowngradesAnUnsafeMediaType()
    {
        await using var factory = new BabyBlueApiFactory(db.BbApiConnectionString);
        using var client = factory.CreateDefaultHostClient("babyblue.co.za");

        var seed = await SeedGrowthRequestAsync();
        var ownerToken = JwtTestTokenBuilder.CreateToken(PostgresDatabaseFixture.OwnerA);

        try
        {
            var bytes = Encoding.UTF8.GetBytes("<script>alert('xss')</script>");

            Guid assetId;
            using (var upload = new HttpRequestMessage(
                HttpMethod.Post, $"/v1/growth/requests/{seed.RequestId}/assets"))
            {
                upload.Headers.Authorization = new AuthenticationHeaderValue("Bearer", ownerToken);
                upload.Content = MultipartAsset("evil.html", "text/html", bytes, "brief_asset");

                using var resp = await client.SendAsync(upload);
                var payload = await resp.Content.ReadAsStringAsync();
                Assert.True(resp.StatusCode == HttpStatusCode.Created, $"upload -> {(int)resp.StatusCode}: {payload}");

                using var doc = JsonDocument.Parse(payload);
                assetId = doc.RootElement.GetProperty("id").GetGuid();
            }

            // Metadata listing never carries the bytes.
            using (var list = await SendAsync(client, ownerToken, HttpMethod.Get,
                $"/v1/growth/requests/{seed.RequestId}/assets", null))
            {
                Assert.Equal(HttpStatusCode.OK, list.StatusCode);
                var payload = await list.Content.ReadAsStringAsync();
                Assert.DoesNotContain("content", payload, StringComparison.OrdinalIgnoreCase);

                using var doc = JsonDocument.Parse(payload);
                var row = doc.RootElement.EnumerateArray().Single(e => e.GetProperty("asset_id").GetGuid() == assetId);

                // The size recorded is the measured byte count, not anything the client declared.
                Assert.Equal(bytes.Length, row.GetProperty("size_bytes").GetInt32());
            }

            using (var download = await SendAsync(client, ownerToken, HttpMethod.Get,
                $"/v1/growth/assets/{assetId}/content", null))
            {
                Assert.Equal(HttpStatusCode.OK, download.StatusCode);

                Assert.Equal("attachment", download.Content.Headers.ContentDisposition?.DispositionType);
                Assert.Contains("evil.html", download.Content.Headers.ContentDisposition?.ToString() ?? "");

                // text/html is not on the allowlist, so it is served as opaque bytes.
                Assert.Equal("application/octet-stream", download.Content.Headers.ContentType?.MediaType);

                Assert.Equal("nosniff", download.Headers.GetValues("X-Content-Type-Options").Single());
                Assert.Contains("no-store", download.Headers.CacheControl?.ToString() ?? "");

                Assert.Equal(bytes, await download.Content.ReadAsByteArrayAsync());
            }
        }
        finally
        {
            await CleanupGrowthAsync(seed);
        }
    }

    /// <summary>
    /// Who may upload what is the procedure's decision: a practice owner may attach a brief, only
    /// a marketing operator may attach a deliverable. Otherwise a practice could mark its own
    /// work delivered.
    /// </summary>
    [Fact]
    public async Task APracticeOwner_CannotUploadADeliverable()
    {
        await using var factory = new BabyBlueApiFactory(db.BbApiConnectionString);
        using var client = factory.CreateDefaultHostClient("babyblue.co.za");

        var seed = await SeedGrowthRequestAsync();
        var ownerToken = JwtTestTokenBuilder.CreateToken(PostgresDatabaseFixture.OwnerA);

        try
        {
            using var req = new HttpRequestMessage(
                HttpMethod.Post, $"/v1/growth/requests/{seed.RequestId}/assets");
            req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", ownerToken);
            req.Content = MultipartAsset("final.pdf", "application/pdf", [1, 2, 3, 4], "deliverable");

            using var resp = await client.SendAsync(req);
            Assert.Equal(HttpStatusCode.Forbidden, resp.StatusCode);

            using var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
            Assert.Equal("forbidden", doc.RootElement.GetProperty("code").GetString());
        }
        finally
        {
            await CleanupGrowthAsync(seed);
        }
    }

    /// <summary>
    /// F-13: the size limit is enforced on the bytes, not on anything the caller says about them.
    ///
    /// The earlier draft guarded on a client-supplied <c>p_size_bytes</c>, so understating it
    /// bypassed the limit. This posts 6 MiB and asserts it is refused — and the controller refuses
    /// it while streaming, so an oversized upload cannot be used to make the server buffer it
    /// first.
    /// </summary>
    [Fact]
    public async Task AnOversizedAsset_IsRefused_RegardlessOfWhatTheClientClaims()
    {
        await using var factory = new BabyBlueApiFactory(db.BbApiConnectionString);
        using var client = factory.CreateDefaultHostClient("babyblue.co.za");

        var seed = await SeedGrowthRequestAsync();
        var ownerToken = JwtTestTokenBuilder.CreateToken(PostgresDatabaseFixture.OwnerA);

        try
        {
            var oversized = new byte[6 * 1024 * 1024];
            Random.Shared.NextBytes(oversized);

            using var req = new HttpRequestMessage(
                HttpMethod.Post, $"/v1/growth/requests/{seed.RequestId}/assets");
            req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", ownerToken);

            // Declared length of 1 byte, actual payload 6 MiB.
            var content = MultipartAsset("huge.pdf", "application/pdf", oversized, "brief_asset");
            content.Add(new StringContent("1"), "size_bytes");
            req.Content = content;

            using var resp = await client.SendAsync(req);
            Assert.Equal(HttpStatusCode.RequestEntityTooLarge, resp.StatusCode);

            using var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
            Assert.Equal("asset_too_large", doc.RootElement.GetProperty("code").GetString());

            // Nothing was stored.
            await using var conn = new NpgsqlConnection(db.SuperuserConnectionString);
            Assert.Equal(0, await conn.ExecuteScalarAsync<int>(
                "select count(*) from public.marketing_assets where request_id = @r",
                new { r = seed.RequestId }));
        }
        finally
        {
            await CleanupGrowthAsync(seed);
        }
    }

    /// <summary>
    /// The Growth state machine decides both which transition is legal and which side may make
    /// it. A practice submits its own draft; it may not then review its own submission, because
    /// that is the operator's move.
    /// </summary>
    [Fact]
    public async Task GrowthStatus_AllowsTheOwnersMove_AndRefusesTheOperatorsMove()
    {
        await using var factory = new BabyBlueApiFactory(db.BbApiConnectionString);
        using var client = factory.CreateDefaultHostClient("babyblue.co.za");

        var seed = await SeedGrowthRequestAsync();
        var ownerToken = JwtTestTokenBuilder.CreateToken(PostgresDatabaseFixture.OwnerA);

        try
        {
            // draft -> submitted is the practice's move.
            using (var ok = await SendAsync(client, ownerToken, HttpMethod.Put,
                $"/v1/growth/requests/{seed.RequestId}/status", new { status = "submitted" }))
            {
                Assert.Equal(HttpStatusCode.NoContent, ok.StatusCode);
            }

            // submitted -> in_review belongs to a marketing operator.
            using (var refused = await SendAsync(client, ownerToken, HttpMethod.Put,
                $"/v1/growth/requests/{seed.RequestId}/status", new { status = "in_review" }))
            {
                Assert.Equal(HttpStatusCode.Conflict, refused.StatusCode);
                using var doc = JsonDocument.Parse(await refused.Content.ReadAsStringAsync());
                Assert.Equal("invalid_transition", doc.RootElement.GetProperty("code").GetString());
            }

            // A label the enum does not have is refused at the edge, not sent to the database
            // where it would arrive as SQLSTATE 22P02 and map to no documented code.
            using (var nonsense = await SendAsync(client, ownerToken, HttpMethod.Put,
                $"/v1/growth/requests/{seed.RequestId}/status", new { status = "not_a_status" }))
            {
                Assert.Equal(HttpStatusCode.BadRequest, nonsense.StatusCode);
                using var doc = JsonDocument.Parse(await nonsense.Content.ReadAsStringAsync());
                Assert.Equal("invalid_argument", doc.RootElement.GetProperty("code").GetString());
            }

            // The marketing operator's inbox is closed to a practice owner.
            using (var inbox = await SendAsync(client, ownerToken, HttpMethod.Get, "/v1/growth/inbox", null))
            {
                Assert.Equal(HttpStatusCode.Forbidden, inbox.StatusCode);
            }
        }
        finally
        {
            await CleanupGrowthAsync(seed);
        }
    }

    /// <summary>
    /// Definition of Done: every authenticated response carries <c>Cache-Control: no-store</c>.
    /// A shared proxy must never hold one patient's or one practice's data where another request
    /// could be served it.
    /// </summary>
    [Fact]
    public async Task EveryAuthenticatedResponse_CarriesNoStore()
    {
        await using var factory = new BabyBlueApiFactory(db.BbApiConnectionString);
        using var client = factory.CreateDefaultHostClient("babyblue.co.za");
        var ownerAToken = JwtTestTokenBuilder.CreateToken(PostgresDatabaseFixture.OwnerA);

        string[] paths =
        [
            "/v1/practices",
            "/v1/me/platform-role",
            "/v1/me/profile",
            "/v1/me/appointments",
            $"/v1/practices/{PracticeA}/dashboard",
            $"/v1/practices/{PracticeA}/clients",
            $"/v1/practices/{PracticeA}/settings",
            "/v1/growth/services",
        ];

        var failures = new List<string>();
        foreach (var path in paths)
        {
            using var resp = await SendAsync(client, ownerAToken, HttpMethod.Get, path, null);
            var cacheControl = resp.Headers.CacheControl?.ToString() ?? "";
            if (!cacheControl.Contains("no-store", StringComparison.OrdinalIgnoreCase))
            {
                failures.Add($"GET {path} -> Cache-Control: '{cacheControl}'");
            }
        }

        Assert.True(failures.Count == 0, string.Join("\n", failures));
    }

    /// <summary>
    /// Definition of Done: an anonymous public read may be cached, but the identical request
    /// carrying a token must not be — otherwise a shared cache could serve a personalised
    /// response to the next anonymous caller.
    /// </summary>
    [Fact]
    public async Task APublicRead_IsCacheableAnonymously_ButNeverWithAToken()
    {
        await using var factory = new BabyBlueApiFactory(db.BbApiConnectionString);
        using var client = factory.CreateDefaultHostClient("babyblue.co.za");

        using (var anon = await client.GetAsync("/v1/directory/cities"))
        {
            Assert.Equal(HttpStatusCode.OK, anon.StatusCode);
            Assert.Contains("max-age", anon.Headers.CacheControl?.ToString() ?? "");
        }

        var token = JwtTestTokenBuilder.CreateToken(PostgresDatabaseFixture.Consumer1);
        using (var authed = await SendAsync(client, token, HttpMethod.Get, "/v1/directory/cities", null))
        {
            Assert.Equal(HttpStatusCode.OK, authed.StatusCode);
            Assert.Contains("no-store", authed.Headers.CacheControl?.ToString() ?? "");
        }
    }

    // ------------------------------------------------------------------ helpers

    private sealed record GrowthSeed(Guid ServiceId, Guid RequestId);

    /// <summary>
    /// Seeds a marketing service and a draft request owned by practice A. Done directly rather
    /// than through the API because `marketing_services` is a platform-managed catalogue with no
    /// write route, by design.
    /// </summary>
    private async Task<GrowthSeed> SeedGrowthRequestAsync()
    {
        await using var conn = new NpgsqlConnection(db.SuperuserConnectionString);
        await conn.OpenAsync();

        var serviceId = Guid.NewGuid();
        var requestId = Guid.NewGuid();

        await conn.ExecuteAsync(
            """
            insert into public.marketing_services (id, slug, name, description)
            values (@serviceId, @slug, 'Phase 5 Service', 'Fixture service');

            insert into public.marketing_requests
                   (id, practice_id, service_id, created_by, status, title, brief)
            values (@requestId, @practice, @serviceId, @owner, 'draft', 'Phase 5 Brief',
                    'Fixture brief for the Growth tests.');
            """,
            new
            {
                serviceId,
                slug = $"phase5-{serviceId:N}",
                requestId,
                practice = PracticeA,
                owner = PostgresDatabaseFixture.OwnerA,
            });

        return new GrowthSeed(serviceId, requestId);
    }

    private async Task CleanupGrowthAsync(GrowthSeed seed)
    {
        await using var conn = new NpgsqlConnection(db.SuperuserConnectionString);
        await conn.ExecuteAsync(
            """
            delete from public.campaign_report_metrics
             where report_id in (select id from public.campaign_reports where request_id = @requestId);
            delete from public.campaign_reports where request_id = @requestId;
            delete from public.campaign_updates where request_id = @requestId;
            delete from public.marketing_assets where request_id = @requestId;
            delete from public.marketing_approvals where request_id = @requestId;
            delete from public.marketing_requests where id = @requestId;
            delete from public.marketing_services where id = @serviceId;
            """,
            new { seed.RequestId, seed.ServiceId });
    }

    private static MultipartFormDataContent MultipartAsset(
        string fileName, string mime, byte[] bytes, string kind)
    {
        var file = new ByteArrayContent(bytes);
        file.Headers.ContentType = new MediaTypeHeaderValue(mime);

        return new MultipartFormDataContent
        {
            { file, "file", fileName },
            { new StringContent(kind), "kind" },
        };
    }

    private static async Task<List<DateTimeOffset>> ReadAuditPageAsync(
        HttpClient client, string token, int limit, DateTimeOffset? before)
    {
        var path = $"/v1/platform/audit-log?practice={PracticeA}&limit={limit}";
        if (before is { } cursor)
        {
            path += $"&before={Uri.EscapeDataString(cursor.ToUniversalTime().ToString("o"))}";
        }

        using var resp = await SendAsync(client, token, HttpMethod.Get, path, null);
        var payload = await resp.Content.ReadAsStringAsync();
        Assert.True(resp.StatusCode == HttpStatusCode.OK, $"GET {path} -> {(int)resp.StatusCode}: {payload}");

        using var doc = JsonDocument.Parse(payload);
        return doc.RootElement.EnumerateArray()
            .Select(e => e.GetProperty("at").GetDateTimeOffset())
            .ToList();
    }

    private static async Task<HttpResponseMessage> SendAsync(
        HttpClient client, string token, HttpMethod method, string path, object? body)
    {
        using var req = new HttpRequestMessage(method, path);
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        if (body is not null)
        {
            req.Content = JsonContent.Create(body);
        }

        return await client.SendAsync(req);
    }
}
