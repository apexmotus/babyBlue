using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using BabyBlue.Integration.Tests.Fixtures;
using Dapper;
using Npgsql;
using Xunit;

namespace BabyBlue.Integration.Tests;

/// <summary>
/// Phase 4 exit gates. The theme throughout: the API routes and the database decides.
/// Every assertion here is about a refusal arriving with the right status and code, having been
/// made by a procedure rather than by a controller.
/// </summary>
[Collection(PostgresDatabaseCollection.Name)]
public sealed class Phase4PracticeRoutesTests(PostgresDatabaseFixture db)
{
    private static readonly Guid PracticeA = PostgresDatabaseFixture.PracticeA;
    private static readonly Guid PractitionerA = PostgresDatabaseFixture.PractitionerA;
    private static readonly Guid ServiceA = PostgresDatabaseFixture.ServiceA;

    /// <summary>
    /// Every practice-scoped route, with a minimally valid body where one is required.
    ///
    /// The bodies matter: model validation runs before the action, so an empty body would return
    /// 400 and the test would pass while proving nothing about authorisation. Each entry has to be
    /// shaped well enough to reach the procedure, so that a 403 is genuinely the database refusing.
    /// </summary>
    private static IEnumerable<(HttpMethod Method, string Path, object? Body)> PracticeScopedRoutes(Guid p)
    {
        var any = Guid.Parse("00000000-0000-4000-8000-0000000000ff");
        var from = Utc(DateTimeOffset.UtcNow);
        var to = Utc(DateTimeOffset.UtcNow.AddDays(7));
        var day = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(3)).ToString("yyyy-MM-dd");

        // context (9 scoped; GET /v1/practices and /v1/me/platform-role are not practice-scoped)
        yield return (HttpMethod.Get, $"/v1/practices/{p}/dashboard", null);
        yield return (HttpMethod.Get, $"/v1/practices/{p}/insights", null);
        yield return (HttpMethod.Get, $"/v1/practices/{p}/setup-progress", null);
        yield return (HttpMethod.Get, $"/v1/practices/{p}/calendar/appointments?from={from}&to={to}", null);
        yield return (HttpMethod.Get, $"/v1/practices/{p}/calendar/availability", null);
        yield return (HttpMethod.Get, $"/v1/practices/{p}/calendar/time-off?from={from}&to={to}", null);
        yield return (HttpMethod.Get, $"/v1/practices/{p}/queue/preview", null);
        yield return (HttpMethod.Get, $"/v1/practices/{p}/queue/waiting-count", null);
        yield return (HttpMethod.Get, $"/v1/practices/{p}/bookings/recent", null);

        // team (12)
        yield return (HttpMethod.Get, $"/v1/practices/{p}/practitioners", null);
        yield return (HttpMethod.Post, $"/v1/practices/{p}/practitioners",
            new { display_name = "Denied Practitioner", speciality_slug = "physiotherapy" });
        yield return (HttpMethod.Patch, $"/v1/practices/{p}/practitioners/{PractitionerA}",
            new { display_name = "Renamed" });
        yield return (HttpMethod.Get, $"/v1/practices/{p}/practitioners/{PractitionerA}/services", null);
        yield return (HttpMethod.Put, $"/v1/practices/{p}/practitioners/{PractitionerA}/services",
            new { service_ids = new[] { ServiceA } });
        yield return (HttpMethod.Get, $"/v1/practices/{p}/practitioners/{PractitionerA}/registrations", null);
        yield return (HttpMethod.Post, $"/v1/practices/{p}/practitioners/{PractitionerA}/registrations",
            new { body_code = "HPCSA", number = "PT0000001" });
        yield return (HttpMethod.Get, $"/v1/practices/{p}/practitioners/{PractitionerA}/verifications", null);
        yield return (HttpMethod.Get, $"/v1/practices/{p}/members", null);
        yield return (HttpMethod.Post, $"/v1/practices/{p}/members",
            new { email = "owner-a@example.test", role = "staff" });
        yield return (HttpMethod.Put, $"/v1/practices/{p}/members/{PostgresDatabaseFixture.OwnerA}/role",
            new { role = "staff" });
        yield return (HttpMethod.Delete, $"/v1/practices/{p}/members/{PostgresDatabaseFixture.ReceptionA}", null);

        // services (5)
        yield return (HttpMethod.Get, $"/v1/practices/{p}/services", null);
        yield return (HttpMethod.Put, $"/v1/practices/{p}/services",
            new { name = "Denied Service", duration_min = 30, buffer_min = 0, price_cents = 1000, active = true });
        yield return (HttpMethod.Get, $"/v1/practices/{p}/services/{ServiceA}/practitioners", null);
        yield return (HttpMethod.Put, $"/v1/practices/{p}/services/{ServiceA}/practitioners",
            new { practitioner_ids = new[] { PractitionerA } });
        yield return (HttpMethod.Post, $"/v1/practices/{p}/services/{ServiceA}/deactivate", null);

        // availability (6)
        yield return (HttpMethod.Get, $"/v1/practices/{p}/practitioners/{PractitionerA}/availability", null);
        yield return (HttpMethod.Put, $"/v1/practices/{p}/practitioners/{PractitionerA}/availability",
            new { weekdays = new[] { 1 }, starts = new[] { "09:00" }, ends = new[] { "17:00" } });
        yield return (HttpMethod.Post, $"/v1/practices/{p}/practitioners/{PractitionerA}/availability/pattern",
            new { weekdays = new[] { 1 }, start = "09:00", end = "17:00" });
        yield return (HttpMethod.Get, $"/v1/practices/{p}/time-off", null);
        yield return (HttpMethod.Post, $"/v1/practices/{p}/time-off",
            new { practitioner_id = PractitionerA, from = day, to = day, reason = "denied" });
        yield return (HttpMethod.Delete, $"/v1/practices/{p}/time-off/{any}", null);

        // clients (9)
        yield return (HttpMethod.Get, $"/v1/practices/{p}/clients", null);
        yield return (HttpMethod.Get, $"/v1/practices/{p}/clients/search?q=a", null);
        yield return (HttpMethod.Get, $"/v1/practices/{p}/clients/{any}", null);
        yield return (HttpMethod.Post, $"/v1/practices/{p}/clients", new { first_name = "Denied" });
        yield return (HttpMethod.Patch, $"/v1/practices/{p}/clients/{any}", new { first_name = "Denied" });
        yield return (HttpMethod.Put, $"/v1/practices/{p}/clients/{any}/notes", new { notes = "denied" });
        yield return (HttpMethod.Get, $"/v1/practices/{p}/clients/{any}/consents", null);
        yield return (HttpMethod.Post, $"/v1/practices/{p}/clients/{any}/consents",
            new { purpose = "record_storage" });
        yield return (HttpMethod.Delete, $"/v1/practices/{p}/clients/{any}/consents/record_storage", null);

        // queue (5)
        yield return (HttpMethod.Get, $"/v1/practices/{p}/queue", null);
        yield return (HttpMethod.Post, $"/v1/practices/{p}/queue/walk-ins", new { name = "Denied Walkin" });
        yield return (HttpMethod.Put, $"/v1/practices/{p}/queue/{any}/status", new { status = "done" });
        yield return (HttpMethod.Post, $"/v1/practices/{p}/queue/call-next", null);
        yield return (HttpMethod.Put, $"/v1/practices/{p}/queue/{any}/client", new { client_id = any });

        // appointments (7)
        yield return (HttpMethod.Get, $"/v1/practices/{p}/appointments/{any}", null);
        yield return (HttpMethod.Get, $"/v1/practices/{p}/appointments/{any}/history", null);
        yield return (HttpMethod.Post, $"/v1/practices/{p}/appointments", new
        {
            practitioner_id = PractitionerA,
            service_id = ServiceA,
            client_id = any,
            starts_at = DateTimeOffset.UtcNow.AddDays(4).ToString("o"),
        });
        yield return (HttpMethod.Put, $"/v1/practices/{p}/appointments/{any}/status", new { status = "confirmed" });
        yield return (HttpMethod.Post, $"/v1/practices/{p}/appointments/{any}/cancel", new { reason = "denied" });
        yield return (HttpMethod.Post, $"/v1/practices/{p}/appointments/{any}/reschedule",
            new { new_starts_at = DateTimeOffset.UtcNow.AddDays(5).ToString("o") });
        yield return (HttpMethod.Get,
            $"/v1/practices/{p}/appointments/slots?practitioner={PractitionerA}&service={ServiceA}&day={day}", null);

        // settings (5 scoped; POST /v1/practices and /onboard are not practice-scoped)
        yield return (HttpMethod.Get, $"/v1/practices/{p}/settings", null);
        yield return (HttpMethod.Patch, $"/v1/practices/{p}/settings", new
        {
            name = "Denied",
            timezone = "Africa/Johannesburg",
            min_notice_minutes = 60,
            cancellation_notice_hours = 24,
        });
        yield return (HttpMethod.Get, $"/v1/practices/{p}/locations", null);
        yield return (HttpMethod.Put, $"/v1/practices/{p}/locations", new { name = "Denied Location" });
        yield return (HttpMethod.Delete, $"/v1/practices/{p}/locations/{any}", null);
    }

    [Fact]
    public void RouteTable_Covers_Every_PracticeScoped_Route()
    {
        // 62 Phase 4 routes minus the 4 that take no {practice}: GET /v1/practices,
        // GET /v1/me/platform-role, POST /v1/practices, POST /v1/practices/onboard.
        Assert.Equal(58, PracticeScopedRoutes(PracticeA).Count());
    }

    /// <summary>
    /// Gate 1a: cross-practice isolation. `ownerB` is a legitimate, fully authenticated practice
    /// owner — of a different practice. Every one of the 58 practice-scoped routes must refuse.
    ///
    /// This is the assertion that would catch a controller that forgot to pass `{practice}`
    /// through to the procedure, or a procedure missing its `_require_member`.
    /// </summary>
    [Fact]
    public async Task AllPracticeScopedRoutes_RejectACrossPracticeOwner_With403Forbidden()
    {
        await using var factory = new BabyBlueApiFactory(db.BbApiConnectionString);
        using var client = factory.CreateDefaultHostClient("babyblue.co.za");
        var ownerBToken = JwtTestTokenBuilder.CreateToken(PostgresDatabaseFixture.OwnerB);

        var failures = new List<string>();

        foreach (var (method, path, body) in PracticeScopedRoutes(PracticeA))
        {
            using var req = new HttpRequestMessage(method, path);
            req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", ownerBToken);
            if (body is not null)
            {
                req.Content = JsonContent.Create(body);
            }

            using var resp = await client.SendAsync(req);
            var payload = await resp.Content.ReadAsStringAsync();

            if (resp.StatusCode != HttpStatusCode.Forbidden)
            {
                failures.Add($"{method} {path} -> {(int)resp.StatusCode} {payload}");
                continue;
            }

            using var doc = JsonDocument.Parse(payload);
            var code = doc.RootElement.GetProperty("code").GetString();
            if (code != "forbidden")
            {
                failures.Add($"{method} {path} -> 403 but code={code}");
            }
        }

        Assert.True(failures.Count == 0, $"{failures.Count} route(s) did not refuse:\n{string.Join("\n", failures)}");
    }

    /// <summary>
    /// Gate 1b: lesser-role denial. `receptionA` is a member of practice A, so
    /// `_require_member` passes and only `_require_role` can stop them. These four routes are
    /// owner-only in the procedures.
    /// </summary>
    [Theory]
    [InlineData("PATCH", "settings")]
    [InlineData("PUT", "member-role")]
    [InlineData("DELETE", "member")]
    [InlineData("POST", "practitioner")]
    public async Task OwnerOnlyMutations_RejectAReceptionist_With403Forbidden(string verb, string which)
    {
        await using var factory = new BabyBlueApiFactory(db.BbApiConnectionString);
        using var client = factory.CreateDefaultHostClient("babyblue.co.za");
        var receptionToken = JwtTestTokenBuilder.CreateToken(PostgresDatabaseFixture.ReceptionA);

        var (method, path, body) = which switch
        {
            "settings" => (new HttpMethod(verb), $"/v1/practices/{PracticeA}/settings", (object?)new
            {
                name = "Practice A",
                timezone = "Africa/Johannesburg",
                min_notice_minutes = 60,
                cancellation_notice_hours = 24,
            }),
            "member-role" => (new HttpMethod(verb),
                $"/v1/practices/{PracticeA}/members/{PostgresDatabaseFixture.ReceptionA}/role",
                new { role = "practice_owner" }),
            "member" => (new HttpMethod(verb),
                $"/v1/practices/{PracticeA}/members/{PostgresDatabaseFixture.OwnerA}", null),
            _ => (new HttpMethod(verb), $"/v1/practices/{PracticeA}/practitioners",
                new { display_name = "Should Not Exist", speciality_slug = "physiotherapy" }),
        };

        using var req = new HttpRequestMessage(method, path);
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", receptionToken);
        if (body is not null)
        {
            req.Content = JsonContent.Create(body);
        }

        using var resp = await client.SendAsync(req);
        Assert.Equal(HttpStatusCode.Forbidden, resp.StatusCode);

        using var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
        Assert.Equal("forbidden", doc.RootElement.GetProperty("code").GetString());
    }

    /// <summary>
    /// Gate 2: the Stage 0 bug. The Practice OS used to write
    /// `update practice_members set role` straight from the browser, so the only owner could
    /// demote themselves and strand the practice with nobody able to administer it.
    /// </summary>
    [Fact]
    public async Task SoleOwner_CannotDemoteThemselves_And_Returns409SoleOwner()
    {
        await using var factory = new BabyBlueApiFactory(db.BbApiConnectionString);
        using var client = factory.CreateDefaultHostClient("babyblue.co.za");
        var ownerAToken = JwtTestTokenBuilder.CreateToken(PostgresDatabaseFixture.OwnerA);

        using var req = new HttpRequestMessage(
            HttpMethod.Put, $"/v1/practices/{PracticeA}/members/{PostgresDatabaseFixture.OwnerA}/role")
        {
            Content = JsonContent.Create(new { role = "practitioner" }),
        };
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", ownerAToken);

        using var resp = await client.SendAsync(req);
        Assert.Equal(HttpStatusCode.Conflict, resp.StatusCode);

        using var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
        Assert.Equal("sole_owner", doc.RootElement.GetProperty("code").GetString());

        // And the demotion did not happen.
        await using var conn = new NpgsqlConnection(db.SuperuserConnectionString);
        var role = await conn.ExecuteScalarAsync<string>(
            "select role::text from public.practice_members where practice_id = @p and user_id = @u",
            new { p = PracticeA, u = PostgresDatabaseFixture.OwnerA });
        Assert.Equal("practice_owner", role);
    }

    /// <summary>
    /// Gate 4: consent is an append-only series, and the newest event governs.
    ///
    /// An append-only log is only a safety property if the guard reads the latest event rather
    /// than "does a grant exist anywhere". So this grants, books successfully, withdraws, proves
    /// booking is then refused with `consent_required`, re-grants, and proves booking works again
    /// — while asserting the original grant is still in the series throughout.
    /// </summary>
    [Fact]
    public async Task ConsentSeries_IsAppendOnly_And_TheNewestEventGovernsBooking()
    {
        await using var factory = new BabyBlueApiFactory(db.BbApiConnectionString);
        using var client = factory.CreateDefaultHostClient("babyblue.co.za");
        var ownerAToken = JwtTestTokenBuilder.CreateToken(PostgresDatabaseFixture.OwnerA);

        // A client created without consent.
        var clientId = await PostJsonForIdAsync(client, ownerAToken, $"/v1/practices/{PracticeA}/clients",
            new { first_name = "Consent", last_name = "Subject", consent_record_storage = false });

        try
        {
            var slot = DateTimeOffset.UtcNow.AddDays(9).Date.AddHours(9);
            var startsAt = new DateTimeOffset(slot, TimeSpan.Zero);

            // 1. No consent yet -> booking refused.
            var beforeGrant = await BookAsync(client, ownerAToken, clientId, startsAt);
            Assert.Equal(HttpStatusCode.Conflict, beforeGrant.Status);
            Assert.Equal("consent_required", beforeGrant.Code);

            // 2. Grant, with evidence.
            await SendAsync(client, ownerAToken, HttpMethod.Post,
                $"/v1/practices/{PracticeA}/clients/{clientId}/consents",
                new { purpose = "record_storage", evidence = new { captured_by = "reception", channel = "in_person" } },
                HttpStatusCode.NoContent);

            var granted = await BookAsync(client, ownerAToken, clientId, startsAt);
            Assert.Equal(HttpStatusCode.Created, granted.Status);

            // 3. Withdraw.
            await SendAsync(client, ownerAToken, HttpMethod.Delete,
                $"/v1/practices/{PracticeA}/clients/{clientId}/consents/record_storage?reason=asked%20to%20stop",
                null, HttpStatusCode.NoContent);

            var afterWithdraw = await BookAsync(client, ownerAToken, clientId, startsAt.AddHours(2));
            Assert.Equal(HttpStatusCode.Conflict, afterWithdraw.Status);
            Assert.Equal("consent_required", afterWithdraw.Code);

            // 4. Re-grant: the newest event governs again.
            await SendAsync(client, ownerAToken, HttpMethod.Post,
                $"/v1/practices/{PracticeA}/clients/{clientId}/consents",
                new { purpose = "record_storage" }, HttpStatusCode.NoContent);

            var reGranted = await BookAsync(client, ownerAToken, clientId, startsAt.AddHours(3));
            Assert.Equal(HttpStatusCode.Created, reGranted.Status);

            // 5. Nothing was erased: all three events survive, oldest first.
            using var listResp = await GetAsync(client, ownerAToken,
                $"/v1/practices/{PracticeA}/clients/{clientId}/consents");
            Assert.Equal(HttpStatusCode.OK, listResp.StatusCode);

            using var doc = JsonDocument.Parse(await listResp.Content.ReadAsStringAsync());
            var events = doc.RootElement.EnumerateArray()
                .Where(e => e.GetProperty("purpose").GetString() == "record_storage")
                .Select(e => e.GetProperty("granted").GetBoolean())
                .ToArray();

            Assert.Equal(3, events.Length);
            Assert.Equal([true, false, true], events);
        }
        finally
        {
            await using var conn = new NpgsqlConnection(db.SuperuserConnectionString);
            await conn.ExecuteAsync(
                """
                delete from public.appointments where client_id = @clientId;
                delete from public.client_consents where client_id = @clientId;
                delete from public.clients where id = @clientId;
                """,
                new { clientId });
        }
    }

    /// <summary>
    /// Gate 4b (first half): a service cannot be made bookable without a price. The DTO allows
    /// a null price deliberately — a priced draft may stay inactive — so this refusal has to come
    /// from the procedure, and it does (F-10).
    /// </summary>
    [Fact]
    public async Task ServiceUpsert_ActiveWithoutAPrice_Returns400PriceRequired()
    {
        await using var factory = new BabyBlueApiFactory(db.BbApiConnectionString);
        using var client = factory.CreateDefaultHostClient("babyblue.co.za");
        var ownerAToken = JwtTestTokenBuilder.CreateToken(PostgresDatabaseFixture.OwnerA);

        using var resp = await SendRawAsync(client, ownerAToken, HttpMethod.Put,
            $"/v1/practices/{PracticeA}/services",
            new { name = "Unpriced But Active", duration_min = 30, buffer_min = 0, price_cents = (int?)null, active = true });

        Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
        using var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
        Assert.Equal("price_required", doc.RootElement.GetProperty("code").GetString());

        // The same service is accepted while inactive, which is what makes the guard conditional
        // rather than a plain NOT NULL.
        using var inactive = await SendRawAsync(client, ownerAToken, HttpMethod.Put,
            $"/v1/practices/{PracticeA}/services",
            new { name = "Unpriced But Inactive", duration_min = 30, buffer_min = 0, price_cents = (int?)null, active = false });

        Assert.Equal(HttpStatusCode.OK, inactive.StatusCode);

        using var created = JsonDocument.Parse(await inactive.Content.ReadAsStringAsync());
        var serviceId = created.RootElement.GetProperty("id").GetGuid();

        await using var conn = new NpgsqlConnection(db.SuperuserConnectionString);
        await conn.ExecuteAsync("delete from public.services where id = @serviceId", new { serviceId });
    }

    /// <summary>
    /// Gates 3 and 4b (second half): the two guards that protect bookings already made.
    /// Deactivating a service, or emptying its practitioner set, must be refused while future
    /// appointments depend on it — and must succeed once they do not.
    /// </summary>
    [Fact]
    public async Task ServiceGuards_RefuseWhileFutureBookingsExist_AndAllowOnceTheyDoNot()
    {
        await using var factory = new BabyBlueApiFactory(db.BbApiConnectionString);
        using var client = factory.CreateDefaultHostClient("babyblue.co.za");
        var ownerAToken = JwtTestTokenBuilder.CreateToken(PostgresDatabaseFixture.OwnerA);

        var clientId = await PostJsonForIdAsync(client, ownerAToken, $"/v1/practices/{PracticeA}/clients",
            new { first_name = "Guard", last_name = "Subject", consent_record_storage = true });

        var startsAt = new DateTimeOffset(DateTimeOffset.UtcNow.AddDays(11).Date.AddHours(10), TimeSpan.Zero);
        var apptId = Guid.Empty;

        try
        {
            var booked = await BookAsync(client, ownerAToken, clientId, startsAt);
            Assert.Equal(HttpStatusCode.Created, booked.Status);
            apptId = booked.Id;

            // Deactivation refused while the booking stands.
            using (var resp = await SendRawAsync(client, ownerAToken, HttpMethod.Post,
                $"/v1/practices/{PracticeA}/services/{ServiceA}/deactivate", null))
            {
                Assert.Equal(HttpStatusCode.Conflict, resp.StatusCode);
                using var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
                Assert.Equal("service_in_use", doc.RootElement.GetProperty("code").GetString());
            }

            // Emptying the practitioner set refused for the same reason: it would leave a booking
            // nobody can deliver.
            using (var resp = await SendRawAsync(client, ownerAToken, HttpMethod.Put,
                $"/v1/practices/{PracticeA}/services/{ServiceA}/practitioners",
                new { practitioner_ids = Array.Empty<Guid>() }))
            {
                Assert.Equal(HttpStatusCode.Conflict, resp.StatusCode);
                using var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
                Assert.Equal("last_practitioner", doc.RootElement.GetProperty("code").GetString());
            }

            // Cancel the appointment, and both become allowed.
            await SendAsync(client, ownerAToken, HttpMethod.Post,
                $"/v1/practices/{PracticeA}/appointments/{apptId}/cancel",
                new { reason = "test teardown" }, HttpStatusCode.NoContent);

            await SendAsync(client, ownerAToken, HttpMethod.Put,
                $"/v1/practices/{PracticeA}/services/{ServiceA}/practitioners",
                new { practitioner_ids = Array.Empty<Guid>() }, HttpStatusCode.NoContent);
        }
        finally
        {
            await using var conn = new NpgsqlConnection(db.SuperuserConnectionString);
            await conn.ExecuteAsync(
                """
                delete from public.appointments where client_id = @clientId;
                delete from public.client_consents where client_id = @clientId;
                delete from public.clients where id = @clientId;
                -- restore the seeded practitioner-service link for other tests
                insert into public.practitioner_services (practice_id, practitioner_id, service_id)
                values (@practiceA, @practitionerA, @serviceA)
                on conflict do nothing;
                update public.services set active = true where id = @serviceA;
                """,
                new { clientId, practiceA = PracticeA, practitionerA = PractitionerA, serviceA = ServiceA });
        }
    }

    /// <summary>
    /// Gate 5: `POST /queue/call-next` is not idempotent, and must not be.
    ///
    /// Two receptionists pressing the button at the same moment must get two different patients.
    /// The procedure uses `for update skip locked`; if that were removed, or if the gateway
    /// retried this volatile call, the two requests would return the same entry and one patient
    /// would be called twice while another was skipped.
    /// </summary>
    [Fact]
    public async Task ConcurrentCallNext_ClaimsTwoDistinctQueueEntries()
    {
        await using var factory = new BabyBlueApiFactory(db.BbApiConnectionString, maxPoolSize: 10);
        using var client = factory.CreateDefaultHostClient("babyblue.co.za");
        var ownerAToken = JwtTestTokenBuilder.CreateToken(PostgresDatabaseFixture.OwnerA);

        await using var conn = new NpgsqlConnection(db.SuperuserConnectionString);
        await conn.OpenAsync();
        await conn.ExecuteAsync(
            "delete from public.queue_entries where practice_id = @p and appointment_id is null",
            new { p = PracticeA });

        var first = await PostJsonForIdAsync(client, ownerAToken, $"/v1/practices/{PracticeA}/queue/walk-ins",
            new { name = "Queue One", urgency = "routine" });
        var second = await PostJsonForIdAsync(client, ownerAToken, $"/v1/practices/{PracticeA}/queue/walk-ins",
            new { name = "Queue Two", urgency = "routine" });

        try
        {
            var callNext = () => SendRawAsync(client, ownerAToken, HttpMethod.Post,
                $"/v1/practices/{PracticeA}/queue/call-next", null);

            var responses = await Task.WhenAll(callNext(), callNext());

            var claimed = new List<Guid>();
            foreach (var resp in responses)
            {
                Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
                using var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
                claimed.Add(doc.RootElement.GetProperty("id").GetGuid());
                resp.Dispose();
            }

            Assert.Equal(2, claimed.Distinct().Count());
            Assert.All(claimed, id => Assert.Contains(id, new[] { first, second }));
        }
        finally
        {
            await conn.ExecuteAsync(
                "delete from public.queue_entries where id in (@first, @second)", new { first, second });
        }
    }

    /// <summary>
    /// Gate 6: the leave window is resolved against the practice's own timezone, not a
    /// hard-coded `+02:00`.
    ///
    /// `practice_timeoff_add` takes `date` bounds and widens them with
    /// `tstzrange((p_from::timestamp) at time zone v_tz, ((p_to + 1)::timestamp) at time zone v_tz)`,
    /// so the stored `tstzrange` depends entirely on `practices.timezone`. In `Africa/Lagos`
    /// (UTC+1) a leave day starting 21 November begins at 20 November 23:00Z; in
    /// `Africa/Johannesburg` (UTC+2) it would begin at 22:00Z. Asserting the instant is therefore
    /// the assertion that the offset came from the practice — and the same test run against the
    /// old hard-coded `+02:00` would fail by exactly one hour.
    /// </summary>
    [Fact]
    public async Task TimeOff_ResolvesTheLeaveWindow_InThePracticesOwnTimezone()
    {
        await using var factory = new BabyBlueApiFactory(db.BbApiConnectionString);
        using var client = factory.CreateDefaultHostClient("babyblue.co.za");
        var ownerAToken = JwtTestTokenBuilder.CreateToken(PostgresDatabaseFixture.OwnerA);

        await using var conn = new NpgsqlConnection(db.SuperuserConnectionString);
        await conn.OpenAsync();
        var originalTz = await conn.ExecuteScalarAsync<string>(
            "select timezone from public.practices where id = @p", new { p = PracticeA });

        try
        {
            await SendAsync(client, ownerAToken, HttpMethod.Patch, $"/v1/practices/{PracticeA}/settings",
                new
                {
                    name = "Practice A",
                    timezone = "Africa/Lagos",
                    min_notice_minutes = 60,
                    cancellation_notice_hours = 24,
                },
                HttpStatusCode.NoContent);

            using (var settings = await GetAsync(client, ownerAToken, $"/v1/practices/{PracticeA}/settings"))
            {
                using var doc = JsonDocument.Parse(await settings.Content.ReadAsStringAsync());
                Assert.Equal("Africa/Lagos", doc.RootElement.GetProperty("timezone").GetString());
            }

            var from = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(20));
            var to = from.AddDays(2);

            var timeOffId = await PostJsonForIdAsync(client, ownerAToken, $"/v1/practices/{PracticeA}/time-off",
                new
                {
                    practitioner_id = PractitionerA,
                    from = from.ToString("yyyy-MM-dd"),
                    to = to.ToString("yyyy-MM-dd"),
                    reason = "timezone regression",
                });

            try
            {
                var bounds = await conn.QuerySingleAsync<(DateTimeOffset Lower, DateTimeOffset Upper)>(
                    """
                    select lower(during) as "Lower", upper(during) as "Upper"
                      from public.time_off where id = @id
                    """,
                    new { id = timeOffId });

                // Africa/Lagos is UTC+1 year-round (no DST), so midnight local is 23:00Z the day before.
                var expectedLower = new DateTimeOffset(from.ToDateTime(TimeOnly.MinValue), TimeSpan.FromHours(1));
                var expectedUpper = new DateTimeOffset(
                    to.AddDays(1).ToDateTime(TimeOnly.MinValue), TimeSpan.FromHours(1));

                Assert.Equal(expectedLower.ToUniversalTime(), bounds.Lower.ToUniversalTime());
                Assert.Equal(expectedUpper.ToUniversalTime(), bounds.Upper.ToUniversalTime());

                // The window is half-open and spans the three whole days requested.
                Assert.Equal(3, (bounds.Upper - bounds.Lower).TotalDays);

                // And it is genuinely not the Johannesburg answer, which is what a hard-coded
                // +02:00 would have produced.
                var johannesburg = new DateTimeOffset(
                    from.ToDateTime(TimeOnly.MinValue), TimeSpan.FromHours(2));
                Assert.NotEqual(johannesburg.ToUniversalTime(), bounds.Lower.ToUniversalTime());
            }
            finally
            {
                await conn.ExecuteAsync(
                    "delete from public.time_off where id = @id", new { id = timeOffId });
            }
        }
        finally
        {
            await conn.ExecuteAsync(
                "update public.practices set timezone = @tz where id = @p",
                new { tz = originalTz, p = PracticeA });
        }
    }

    /// <summary>
    /// Gate 7: practice creation is capped at 3/day/user. A practice is a tenant, and tenant
    /// creation is the one authenticated action whose abuse costs more than bandwidth, so it gets
    /// its own partition rather than sharing the 120/min default.
    /// </summary>
    [Fact]
    public async Task PracticeCreate_FourthInADay_Returns429RateLimited()
    {
        await using var factory = new BabyBlueApiFactory(db.BbApiConnectionString);
        using var client = factory.CreateDefaultHostClient("babyblue.co.za");

        var quotaUser = Guid.NewGuid();
        await using var conn = new NpgsqlConnection(db.SuperuserConnectionString);
        await conn.OpenAsync();
        await conn.ExecuteAsync(
            """
            insert into auth.users (id, email) values (@id, @email);
            insert into public.profiles (id, display_name) values (@id, 'Quota User')
            on conflict (id) do nothing;
            """,
            new { id = quotaUser, email = $"quota-{quotaUser:N}@example.test" });

        var token = JwtTestTokenBuilder.CreateToken(quotaUser);
        var slugPrefix = $"quota-{quotaUser:N}"[..16];

        try
        {
            for (var i = 1; i <= 3; i++)
            {
                using var ok = await SendRawAsync(client, token, HttpMethod.Post, "/v1/practices",
                    new { name = $"Quota Practice {i}", slug = $"{slugPrefix}-{i}" });
                Assert.Equal(HttpStatusCode.Created, ok.StatusCode);
            }

            using var refused = await SendRawAsync(client, token, HttpMethod.Post, "/v1/practices",
                new { name = "Quota Practice 4", slug = $"{slugPrefix}-4" });

            Assert.Equal(HttpStatusCode.TooManyRequests, refused.StatusCode);
            Assert.True(refused.Headers.Contains("Retry-After"));

            using var doc = JsonDocument.Parse(await refused.Content.ReadAsStringAsync());
            Assert.Equal("rate_limited", doc.RootElement.GetProperty("code").GetString());
        }
        finally
        {
            await conn.ExecuteAsync(
                """
                delete from public.practice_members where user_id = @id;
                delete from public.practices where slug like @slugLike;
                delete from auth.users where id = @id;
                """,
                new { id = quotaUser, slugLike = $"{slugPrefix}%" });
        }
    }

    /// <summary>
    /// Happy-path smoke over the read routes an owner actually loads on first open of the OS, so
    /// a 500 from a shape mismatch between a generated row type and its procedure is caught.
    /// </summary>
    [Fact]
    public async Task OwnerReadRoutes_AllReturn200_ForTheirOwnPractice()
    {
        await using var factory = new BabyBlueApiFactory(db.BbApiConnectionString);
        using var client = factory.CreateDefaultHostClient("babyblue.co.za");
        var ownerAToken = JwtTestTokenBuilder.CreateToken(PostgresDatabaseFixture.OwnerA);

        var from = Utc(DateTimeOffset.UtcNow);
        var to = Utc(DateTimeOffset.UtcNow.AddDays(7));
        var day = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(3)).ToString("yyyy-MM-dd");

        string[] paths =
        [
            "/v1/practices",
            "/v1/me/platform-role",
            $"/v1/practices/{PracticeA}/dashboard",
            $"/v1/practices/{PracticeA}/insights",
            $"/v1/practices/{PracticeA}/setup-progress",
            $"/v1/practices/{PracticeA}/calendar/appointments?from={from}&to={to}",
            $"/v1/practices/{PracticeA}/calendar/availability",
            $"/v1/practices/{PracticeA}/calendar/time-off?from={from}&to={to}",
            $"/v1/practices/{PracticeA}/queue/preview",
            $"/v1/practices/{PracticeA}/queue/waiting-count",
            $"/v1/practices/{PracticeA}/bookings/recent",
            $"/v1/practices/{PracticeA}/practitioners",
            $"/v1/practices/{PracticeA}/practitioners/{PractitionerA}/services",
            $"/v1/practices/{PracticeA}/practitioners/{PractitionerA}/registrations",
            $"/v1/practices/{PracticeA}/practitioners/{PractitionerA}/verifications",
            $"/v1/practices/{PracticeA}/practitioners/{PractitionerA}/availability",
            $"/v1/practices/{PracticeA}/members",
            $"/v1/practices/{PracticeA}/services",
            $"/v1/practices/{PracticeA}/services/{ServiceA}/practitioners",
            $"/v1/practices/{PracticeA}/time-off",
            $"/v1/practices/{PracticeA}/clients",
            $"/v1/practices/{PracticeA}/clients/search?q=a",
            $"/v1/practices/{PracticeA}/queue",
            $"/v1/practices/{PracticeA}/settings",
            $"/v1/practices/{PracticeA}/locations",
            $"/v1/practices/{PracticeA}/appointments/slots?practitioner={PractitionerA}&service={ServiceA}&day={day}",
        ];

        var failures = new List<string>();
        foreach (var path in paths)
        {
            using var resp = await GetAsync(client, ownerAToken, path);
            if (resp.StatusCode != HttpStatusCode.OK)
            {
                failures.Add($"GET {path} -> {(int)resp.StatusCode} {await resp.Content.ReadAsStringAsync()}");
            }
        }

        Assert.True(failures.Count == 0, $"{failures.Count} read route(s) failed:\n{string.Join("\n", failures)}");
    }

    /// <summary>
    /// Shape refusals the controllers do make, because the database cannot see them: a calendar
    /// window wider than 90 days, and three positional arrays of unequal length.
    /// </summary>
    [Fact]
    public async Task ShapeRefusals_AreMadeAtTheEdge_WithDocumentedCodes()
    {
        await using var factory = new BabyBlueApiFactory(db.BbApiConnectionString);
        using var client = factory.CreateDefaultHostClient("babyblue.co.za");
        var ownerAToken = JwtTestTokenBuilder.CreateToken(PostgresDatabaseFixture.OwnerA);

        var from = DateTimeOffset.UtcNow;
        var tooFar = Utc(from.AddDays(120));

        using (var resp = await GetAsync(client, ownerAToken,
            $"/v1/practices/{PracticeA}/calendar/appointments?from={Utc(from)}&to={tooFar}"))
        {
            Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
            using var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
            Assert.Equal("invalid_range", doc.RootElement.GetProperty("code").GetString());
        }

        using (var resp = await SendRawAsync(client, ownerAToken, HttpMethod.Put,
            $"/v1/practices/{PracticeA}/practitioners/{PractitionerA}/availability",
            new { weekdays = new[] { 1, 2 }, starts = new[] { "09:00" }, ends = new[] { "17:00" } }))
        {
            Assert.Equal(HttpStatusCode.BadRequest, resp.StatusCode);
            using var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
            Assert.Equal("invalid_argument", doc.RootElement.GetProperty("code").GetString());
        }
    }

    // ------------------------------------------------------------------ helpers

    /// <summary>
    /// Z-suffixed UTC for a query string. The round-trip "o" format ends in "+00:00", and an
    /// unencoded "+" in a query value decodes to a space, so the value never parses and the
    /// request fails model binding instead of reaching the procedure.
    /// </summary>
    private static string Utc(DateTimeOffset value) =>
        value.ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ");

    private static Task<HttpResponseMessage> GetAsync(HttpClient client, string token, string path) =>
        SendRawAsync(client, token, HttpMethod.Get, path, null);

    private static async Task<HttpResponseMessage> SendRawAsync(
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

    private static async Task SendAsync(
        HttpClient client, string token, HttpMethod method, string path, object? body,
        HttpStatusCode expected)
    {
        using var resp = await SendRawAsync(client, token, method, path, body);
        var payload = await resp.Content.ReadAsStringAsync();
        Assert.True(resp.StatusCode == expected,
            $"{method} {path} -> {(int)resp.StatusCode}, expected {(int)expected}: {payload}");
    }

    private static async Task<Guid> PostJsonForIdAsync(
        HttpClient client, string token, string path, object body)
    {
        using var resp = await SendRawAsync(client, token, HttpMethod.Post, path, body);
        var payload = await resp.Content.ReadAsStringAsync();
        Assert.True(
            resp.StatusCode is HttpStatusCode.Created or HttpStatusCode.OK,
            $"POST {path} -> {(int)resp.StatusCode}: {payload}");

        using var doc = JsonDocument.Parse(payload);
        return doc.RootElement.GetProperty("id").GetGuid();
    }

    private static async Task<(HttpStatusCode Status, string? Code, Guid Id)> BookAsync(
        HttpClient client, string token, Guid clientId, DateTimeOffset startsAt)
    {
        using var resp = await SendRawAsync(client, token, HttpMethod.Post,
            $"/v1/practices/{PracticeA}/appointments",
            new
            {
                practitioner_id = PractitionerA,
                service_id = ServiceA,
                client_id = clientId,
                starts_at = startsAt.ToString("o"),
                source = "os",
            });

        var payload = await resp.Content.ReadAsStringAsync();
        using var doc = JsonDocument.Parse(payload);

        if (resp.StatusCode == HttpStatusCode.Created)
        {
            return (resp.StatusCode, null, doc.RootElement.GetProperty("id").GetGuid());
        }

        var code = doc.RootElement.TryGetProperty("code", out var c) ? c.GetString() : null;
        return (resp.StatusCode, code, Guid.Empty);
    }
}
