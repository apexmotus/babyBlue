using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Threading.Tasks;
using BabyBlue.Contracts.Patient;
using BabyBlue.Integration.Tests.Fixtures;
using Dapper;
using Npgsql;
using Xunit;

namespace BabyBlue.Integration.Tests;

[Collection(PostgresDatabaseCollection.Name)]
public sealed class Phase3PatientEndpointsTests(PostgresDatabaseFixture db)
{
    [Fact]
    public async Task All13PatientRoutes_RejectUnauthenticated_With401NotAuthenticated()
    {
        await using var factory = new BabyBlueApiFactory(db.BbApiConnectionString);
        using var client = factory.CreateDefaultHostClient("babyblue.co.za");

        var dummyId = Guid.NewGuid();
        var requests = new (HttpMethod Method, string Path, object? Body)[]
        {
            (HttpMethod.Get, "/v1/me/profile", null),
            (HttpMethod.Patch, "/v1/me/profile", new { display_name = "Test", phone = "+27821234567" }),
            (HttpMethod.Get, "/v1/me/appointments", null),
            (HttpMethod.Get, $"/v1/me/appointments/{dummyId}", null),
            (HttpMethod.Post, "/v1/me/holds", new
            {
                practitioner_id = PostgresDatabaseFixture.PractitionerA,
                service_id = PostgresDatabaseFixture.ServiceA,
                starts_at = DateTimeOffset.UtcNow.AddDays(3)
            }),
            (HttpMethod.Get, $"/v1/me/holds/{dummyId}", null),
            (HttpMethod.Delete, $"/v1/me/holds/{dummyId}", null),
            (HttpMethod.Post, "/v1/me/appointments", new { hold_id = dummyId }),
            (HttpMethod.Post, $"/v1/me/appointments/{dummyId}/cancel", new { reason = "Test" }),
            (HttpMethod.Post, $"/v1/me/appointments/{dummyId}/reschedule", new { new_starts_at = DateTimeOffset.UtcNow.AddDays(4) }),
            (HttpMethod.Post, $"/v1/me/appointments/{dummyId}/check-in", null),
            (HttpMethod.Get, "/v1/me/export", null),
            (HttpMethod.Delete, "/v1/me", null),
        };

        Assert.Equal(13, requests.Length);

        foreach (var (method, path, body) in requests)
        {
            using var req = new HttpRequestMessage(method, path);
            if (body is not null)
            {
                req.Content = JsonContent.Create(body);
            }

            using var resp = await client.SendAsync(req);
            Assert.Equal(HttpStatusCode.Unauthorized, resp.StatusCode);

            using var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
            Assert.Equal("not_authenticated", doc.RootElement.GetProperty("code").GetString());
            Assert.False(string.IsNullOrWhiteSpace(doc.RootElement.GetProperty("request_id").GetString()));
        }
    }

    [Fact]
    public async Task PhoneValidation_DtoPatternAndDatabaseConstraint_AcceptAndRejectIdenticalSet_AndSurface400ProfilesPhoneInternational()
    {
        var testCases = new (string? Phone, bool ExpectedValid)[]
        {
            (null, true),
            ("+27821234567", true),
            ("+27115551234", true),
            ("+447911123456", true),
            ("+12025550123", true),
            ("0821234567", false),
            ("+0821234567", false),
            ("+27123", false),
            ("+27821234567890123", false),
            ("+27-82-123-4567", false),
            ("not-a-phone", false),
        };

        await using var conn = new NpgsqlConnection(db.SuperuserConnectionString);
        await conn.OpenAsync();

        var tempUserId = Guid.NewGuid();
        await conn.ExecuteAsync(
            "insert into auth.users (id, email) values (@id, @email); insert into public.profiles (id, display_name) values (@id, 'Phone Test') on conflict (id) do update set display_name = excluded.display_name;",
            new { id = tempUserId, email = $"phone-{tempUserId:N}@example.test" });

        try
        {
            foreach (var (phone, expectedValid) in testCases)
            {
                var dtoAccepted = UpdateProfileRequest.IsValidPhone(phone);
                Assert.Equal(expectedValid, dtoAccepted);

                bool dbAccepted;
                try
                {
                    await conn.ExecuteAsync(
                        "update public.profiles set phone = @phone where id = @id",
                        new { id = tempUserId, phone });
                    dbAccepted = true;
                }
                catch (PostgresException pgEx) when (pgEx.ConstraintName == "profiles_phone_international")
                {
                    dbAccepted = false;
                }

                Assert.Equal(dtoAccepted, dbAccepted);
            }

            await using var factory = new BabyBlueApiFactory(db.BbApiConnectionString);
            using var client = factory.CreateDefaultHostClient("babyblue.co.za");
            var token = JwtTestTokenBuilder.CreateToken(tempUserId);

            // Happy profile read & update
            using (var getReq = CreateAuthReq(HttpMethod.Get, "/v1/me/profile", token))
            using (var getResp = await client.SendAsync(getReq))
            {
                Assert.Equal(HttpStatusCode.OK, getResp.StatusCode);
                using var doc = JsonDocument.Parse(await getResp.Content.ReadAsStringAsync());
                Assert.Equal("Phone Test", doc.RootElement.GetProperty("display_name").GetString());
            }

            using (var patchReq = CreateAuthReq(HttpMethod.Patch, "/v1/me/profile", token, new
            {
                display_name = "Updated Name",
                phone = "+27829998877"
            }))
            using (var patchResp = await client.SendAsync(patchReq))
            {
                Assert.Equal(HttpStatusCode.NoContent, patchResp.StatusCode);
            }

            // Invalid phone -> 400 profiles_phone_international
            using (var badPhoneReq = CreateAuthReq(HttpMethod.Patch, "/v1/me/profile", token, new
            {
                display_name = "Updated Name",
                phone = "0829998877"
            }))
            using (var badPhoneResp = await client.SendAsync(badPhoneReq))
            {
                Assert.Equal(HttpStatusCode.BadRequest, badPhoneResp.StatusCode);
                using var doc = JsonDocument.Parse(await badPhoneResp.Content.ReadAsStringAsync());
                Assert.Equal("profiles_phone_international", doc.RootElement.GetProperty("code").GetString());
            }

            // Empty display_name -> 400 invalid_name
            using (var badNameReq = CreateAuthReq(HttpMethod.Patch, "/v1/me/profile", token, new
            {
                display_name = "   ",
                phone = "+27829998877"
            }))
            using (var badNameResp = await client.SendAsync(badNameReq))
            {
                Assert.Equal(HttpStatusCode.BadRequest, badNameResp.StatusCode);
                using var doc = JsonDocument.Parse(await badNameResp.Content.ReadAsStringAsync());
                Assert.Equal("invalid_name", doc.RootElement.GetProperty("code").GetString());
            }
        }
        finally
        {
            await conn.ExecuteAsync("delete from auth.users where id = @id", new { id = tempUserId });
        }
    }

    [Fact]
    public async Task PatientBookingLifecycle_HoldGetReleaseBookRescheduleCancel_HappyPathAndCrossConsumerDenials()
    {
        await using var factory = new BabyBlueApiFactory(db.BbApiConnectionString);
        using var client = factory.CreateDefaultHostClient("babyblue.co.za");

        var c1Token = JwtTestTokenBuilder.CreateToken(PostgresDatabaseFixture.Consumer1);
        var c2Token = JwtTestTokenBuilder.CreateToken(PostgresDatabaseFixture.Consumer2);

        // Find available slots 3 days from now
        var targetDay = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(3));
        var slotsResp = await client.GetAsync(
            $"/v1/directory/practitioners/{PostgresDatabaseFixture.PractitionerA}/slots?service_id={PostgresDatabaseFixture.ServiceA}&from={targetDay:yyyy-MM-dd}&to={targetDay:yyyy-MM-dd}");
        Assert.Equal(HttpStatusCode.OK, slotsResp.StatusCode);
        using var slotsDoc = JsonDocument.Parse(await slotsResp.Content.ReadAsStringAsync());
        var slots = slotsDoc.RootElement.EnumerateArray().ToList();
        Assert.True(slots.Count >= 3, "Expected at least 3 available slots on target day.");

        var slot1 = slots[0].GetProperty("starts_at").GetDateTimeOffset();
        var slot2 = slots[1].GetProperty("starts_at").GetDateTimeOffset();
        var slot3 = slots[2].GetProperty("starts_at").GetDateTimeOffset();

        // 1. Consumer 2 creates a hold on slot1, then releases it after Consumer 1 is denied access
        Guid c2HoldId;
        using (var holdReq = CreateAuthReq(HttpMethod.Post, "/v1/me/holds", c2Token, new
        {
            practitioner_id = PostgresDatabaseFixture.PractitionerA,
            service_id = PostgresDatabaseFixture.ServiceA,
            starts_at = slot1
        }))
        using (var holdResp = await client.SendAsync(holdReq))
        {
            Assert.Equal(HttpStatusCode.Created, holdResp.StatusCode);
            using var doc = JsonDocument.Parse(await holdResp.Content.ReadAsStringAsync());
            c2HoldId = doc.RootElement.GetProperty("id").GetGuid();
            Assert.Equal($"/v1/me/holds/{c2HoldId}", holdResp.Headers.Location?.ToString());
        }

        // Consumer 2 can GET their hold
        using (var getHoldReq = CreateAuthReq(HttpMethod.Get, $"/v1/me/holds/{c2HoldId}", c2Token))
        using (var getHoldResp = await client.SendAsync(getHoldReq))
        {
            Assert.Equal(HttpStatusCode.OK, getHoldResp.StatusCode);
        }

        // Consumer 1 cannot GET or DELETE Consumer 2's hold (404 not_found)
        using (var c1GetHold = CreateAuthReq(HttpMethod.Get, $"/v1/me/holds/{c2HoldId}", c1Token))
        using (var c1GetHoldResp = await client.SendAsync(c1GetHold))
        {
            Assert.Equal(HttpStatusCode.NotFound, c1GetHoldResp.StatusCode);
            using var doc = JsonDocument.Parse(await c1GetHoldResp.Content.ReadAsStringAsync());
            Assert.Equal("not_found", doc.RootElement.GetProperty("code").GetString());
        }

        using (var c1DelHold = CreateAuthReq(HttpMethod.Delete, $"/v1/me/holds/{c2HoldId}", c1Token))
        using (var c1DelHoldResp = await client.SendAsync(c1DelHold))
        {
            Assert.Equal(HttpStatusCode.NotFound, c1DelHoldResp.StatusCode);
            using var doc = JsonDocument.Parse(await c1DelHoldResp.Content.ReadAsStringAsync());
            Assert.Equal("not_found", doc.RootElement.GetProperty("code").GetString());
        }

        // Consumer 2 releases their hold (204 No Content)
        using (var relHoldReq = CreateAuthReq(HttpMethod.Delete, $"/v1/me/holds/{c2HoldId}", c2Token))
        using (var relHoldResp = await client.SendAsync(relHoldReq))
        {
            Assert.Equal(HttpStatusCode.NoContent, relHoldResp.StatusCode);
        }

        // 2. Consumer 2 holds slot2 and books an appointment
        Guid c2BookHoldId;
        using (var holdReq = CreateAuthReq(HttpMethod.Post, "/v1/me/holds", c2Token, new
        {
            practitioner_id = PostgresDatabaseFixture.PractitionerA,
            service_id = PostgresDatabaseFixture.ServiceA,
            starts_at = slot2
        }))
        using (var holdResp = await client.SendAsync(holdReq))
        {
            Assert.Equal(HttpStatusCode.Created, holdResp.StatusCode);
            using var doc = JsonDocument.Parse(await holdResp.Content.ReadAsStringAsync());
            c2BookHoldId = doc.RootElement.GetProperty("id").GetGuid();
        }

        Guid c2ApptId;
        using (var bookReq = CreateAuthReq(HttpMethod.Post, "/v1/me/appointments", c2Token, new { hold_id = c2BookHoldId }))
        using (var bookResp = await client.SendAsync(bookReq))
        {
            Assert.Equal(HttpStatusCode.Created, bookResp.StatusCode);
            using var doc = JsonDocument.Parse(await bookResp.Content.ReadAsStringAsync());
            c2ApptId = doc.RootElement.GetProperty("id").GetGuid();
            Assert.Equal($"/v1/me/appointments/{c2ApptId}", bookResp.Headers.Location?.ToString());
        }

        // Consumer 2 lists and gets their appointment
        using (var listReq = CreateAuthReq(HttpMethod.Get, "/v1/me/appointments?upcoming_only=true", c2Token))
        using (var listResp = await client.SendAsync(listReq))
        {
            Assert.Equal(HttpStatusCode.OK, listResp.StatusCode);
            using var doc = JsonDocument.Parse(await listResp.Content.ReadAsStringAsync());
            Assert.Contains(doc.RootElement.EnumerateArray(), el => el.GetProperty("appointment_id").GetGuid() == c2ApptId);
        }

        using (var getApptReq = CreateAuthReq(HttpMethod.Get, $"/v1/me/appointments/{c2ApptId}", c2Token))
        using (var getApptResp = await client.SendAsync(getApptReq))
        {
            Assert.Equal(HttpStatusCode.OK, getApptResp.StatusCode);
        }

        // Consumer 1 cannot GET, cancel, reschedule, or check-in Consumer 2's appointment (404 not_found)
        var crossApptRoutes = new (HttpMethod Method, string Path, object? Body)[]
        {
            (HttpMethod.Get, $"/v1/me/appointments/{c2ApptId}", null),
            (HttpMethod.Post, $"/v1/me/appointments/{c2ApptId}/cancel", new { reason = "Cross cancel" }),
            (HttpMethod.Post, $"/v1/me/appointments/{c2ApptId}/reschedule", new { new_starts_at = slot3 }),
            (HttpMethod.Post, $"/v1/me/appointments/{c2ApptId}/check-in", null),
        };

        foreach (var (method, path, body) in crossApptRoutes)
        {
            using var req = CreateAuthReq(method, path, c1Token, body);
            using var resp = await client.SendAsync(req);
            Assert.True(
                resp.StatusCode is HttpStatusCode.NotFound or HttpStatusCode.Forbidden,
                $"Expected 404 or 403 for {method} {path}, got {resp.StatusCode}");
            using var doc = JsonDocument.Parse(await resp.Content.ReadAsStringAsync());
            var code = doc.RootElement.GetProperty("code").GetString();
            Assert.True(code is "not_found" or "forbidden", $"Unexpected error code {code}");
        }

        // Consumer 2 reschedules their appointment to slot3 (204 No Content)
        using (var reschedReq = CreateAuthReq(HttpMethod.Post, $"/v1/me/appointments/{c2ApptId}/reschedule", c2Token, new
        {
            new_starts_at = slot3
        }))
        using (var reschedResp = await client.SendAsync(reschedReq))
        {
            Assert.Equal(HttpStatusCode.NoContent, reschedResp.StatusCode);
        }

        // Consumer 2 cancels their appointment (204 No Content)
        using (var cancelReq = CreateAuthReq(HttpMethod.Post, $"/v1/me/appointments/{c2ApptId}/cancel", c2Token, new
        {
            reason = "Changed plans"
        }))
        using (var cancelResp = await client.SendAsync(cancelReq))
        {
            Assert.Equal(HttpStatusCode.NoContent, cancelResp.StatusCode);
        }
    }

    [Fact]
    public async Task BookingConcurrency_ParallelSlotHoldsForSameSlot_OneReturns201_OneReturns409SlotUnavailable()
    {
        await using var factory = new BabyBlueApiFactory(db.BbApiConnectionString);
        using var client1 = factory.CreateDefaultHostClient("babyblue.co.za");
        using var client2 = factory.CreateDefaultHostClient("babyblue.co.za");

        var c1Token = JwtTestTokenBuilder.CreateToken(PostgresDatabaseFixture.Consumer1);
        var c2Token = JwtTestTokenBuilder.CreateToken(PostgresDatabaseFixture.Consumer2);

        var targetDay = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(4));
        var slotsResp = await client1.GetAsync(
            $"/v1/directory/practitioners/{PostgresDatabaseFixture.PractitionerA}/slots?service_id={PostgresDatabaseFixture.ServiceA}&from={targetDay:yyyy-MM-dd}&to={targetDay:yyyy-MM-dd}");
        using var slotsDoc = JsonDocument.Parse(await slotsResp.Content.ReadAsStringAsync());
        var targetSlot = slotsDoc.RootElement[0].GetProperty("starts_at").GetDateTimeOffset();

        var body = new
        {
            practitioner_id = PostgresDatabaseFixture.PractitionerA,
            service_id = PostgresDatabaseFixture.ServiceA,
            starts_at = targetSlot
        };

        using var req1 = CreateAuthReq(HttpMethod.Post, "/v1/me/holds", c1Token, body);
        using var req2 = CreateAuthReq(HttpMethod.Post, "/v1/me/holds", c2Token, body);

        var results = await Task.WhenAll(client1.SendAsync(req1), client2.SendAsync(req2));

        var statuses = results.Select(r => r.StatusCode).ToList();
        Assert.Contains(HttpStatusCode.Created, statuses);
        Assert.Contains(HttpStatusCode.Conflict, statuses);

        var conflictResp = results.Single(r => r.StatusCode == HttpStatusCode.Conflict);
        using var conflictDoc = JsonDocument.Parse(await conflictResp.Content.ReadAsStringAsync());
        Assert.Equal("slot_unavailable", conflictDoc.RootElement.GetProperty("code").GetString());

        foreach (var r in results)
        {
            r.Dispose();
        }
    }

    [Fact]
    public async Task HoldQuotaRateLimit_EleventhRapidHold_Returns429TooManyRequests()
    {
        await using var conn = new NpgsqlConnection(db.SuperuserConnectionString);
        await conn.OpenAsync();
        var rateUser = Guid.NewGuid();
        await conn.ExecuteAsync(
            "insert into auth.users (id, email) values (@id, @email); insert into public.profiles (id, display_name) values (@id, 'Rate User') on conflict (id) do update set display_name = excluded.display_name;",
            new { id = rateUser, email = $"rate-{rateUser:N}@example.test" });

        try
        {
            await using var factory = new BabyBlueApiFactory(db.BbApiConnectionString);
            using var client = factory.CreateDefaultHostClient("babyblue.co.za");
            var token = JwtTestTokenBuilder.CreateToken(rateUser);

            var targetDay = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(5));
            var slotsResp = await client.GetAsync(
                $"/v1/directory/practitioners/{PostgresDatabaseFixture.PractitionerA}/slots?service_id={PostgresDatabaseFixture.ServiceA}&from={targetDay:yyyy-MM-dd}&to={targetDay:yyyy-MM-dd}");
            using var slotsDoc = JsonDocument.Parse(await slotsResp.Content.ReadAsStringAsync());
            var slot = slotsDoc.RootElement[0].GetProperty("starts_at").GetDateTimeOffset();

            HttpResponseMessage? eleventhResponse = null;
            for (var i = 1; i <= 11; i++)
            {
                using var req = CreateAuthReq(HttpMethod.Post, "/v1/me/holds", token, new
                {
                    practitioner_id = PostgresDatabaseFixture.PractitionerA,
                    service_id = PostgresDatabaseFixture.ServiceA,
                    starts_at = slot
                });
                var resp = await client.SendAsync(req);
                if (i < 11)
                {
                    Assert.NotEqual(HttpStatusCode.TooManyRequests, resp.StatusCode);
                    resp.Dispose();
                }
                else
                {
                    eleventhResponse = resp;
                }
            }

            Assert.NotNull(eleventhResponse);
            using (eleventhResponse)
            {
                Assert.Equal(HttpStatusCode.TooManyRequests, eleventhResponse.StatusCode);
                Assert.True(eleventhResponse.Headers.Contains("Retry-After"));
                using var doc = JsonDocument.Parse(await eleventhResponse.Content.ReadAsStringAsync());

                // The SlotHold policy IS the hold quota, so it reports the quota's own code and
                // the patient gets the `too_many_holds` prose rather than a raw machine string.
                Assert.Equal("too_many_holds", doc.RootElement.GetProperty("code").GetString());
            }
        }
        finally
        {
            await conn.ExecuteAsync("delete from auth.users where id = @id", new { id = rateUser });
        }
    }

    [Fact]
    public async Task CancellationAndCheckInWindows_Enforce409TooLateToCancel_And409TooEarlyToCheckIn()
    {
        await using var conn = new NpgsqlConnection(db.SuperuserConnectionString);
        await conn.OpenAsync();

        var nearApptId = Guid.NewGuid();
        var farApptId = Guid.NewGuid();
        var clientId = Guid.NewGuid();

        await conn.ExecuteAsync(
            """
            insert into public.clients (id, practice_id, user_id, first_name, last_name)
            values (@clientId, @practiceId, @consumerId, 'Window', 'Tester')
            on conflict do nothing;

            -- Inside 24h cancellation window (starts in 1 hour -> can check in, cannot cancel)
            insert into public.appointments (
              id, practice_id, practitioner_id, service_id, location_id, client_id, consumer_id,
              starts_at, ends_at, buffer_min, price_cents, currency, status, source
            ) values (
              @nearApptId, @practiceId, @practitionerId, @serviceId, '00000000-0000-4000-8000-000000000501', @clientId, @consumerId,
              now() + interval '1 hour', now() + interval '90 minutes', 0, 65000, 'ZAR', 'confirmed', 'app'
            );

            -- More than 2 hours in future (starts in 48 hours -> too early to check in)
            insert into public.appointments (
              id, practice_id, practitioner_id, service_id, location_id, client_id, consumer_id,
              starts_at, ends_at, buffer_min, price_cents, currency, status, source
            ) values (
              @farApptId, @practiceId, @practitionerId, @serviceId, '00000000-0000-4000-8000-000000000501', @clientId, @consumerId,
              now() + interval '48 hours', now() + interval '48 hours 30 minutes', 0, 65000, 'ZAR', 'confirmed', 'app'
            );
            """,
            new
            {
                clientId,
                nearApptId,
                farApptId,
                practiceId = PostgresDatabaseFixture.PracticeA,
                practitionerId = PostgresDatabaseFixture.PractitionerA,
                serviceId = PostgresDatabaseFixture.ServiceA,
                consumerId = PostgresDatabaseFixture.Consumer1,
            });

        try
        {
            await using var factory = new BabyBlueApiFactory(db.BbApiConnectionString);
            using var client = factory.CreateDefaultHostClient("babyblue.co.za");
            var token = JwtTestTokenBuilder.CreateToken(PostgresDatabaseFixture.Consumer1);

            // 1. Cancel near appointment (1 hour away, inside 24h window) -> 409 too_late_to_cancel
            using (var cancelReq = CreateAuthReq(HttpMethod.Post, $"/v1/me/appointments/{nearApptId}/cancel", token, new { reason = "Late" }))
            using (var cancelResp = await client.SendAsync(cancelReq))
            {
                Assert.Equal(HttpStatusCode.Conflict, cancelResp.StatusCode);
                using var doc = JsonDocument.Parse(await cancelResp.Content.ReadAsStringAsync());
                Assert.Equal("too_late_to_cancel", doc.RootElement.GetProperty("code").GetString());
            }

            // 2. Check in far appointment (48 hours away, > 2h window) -> 409 too_early_to_check_in
            using (var earlyCheckInReq = CreateAuthReq(HttpMethod.Post, $"/v1/me/appointments/{farApptId}/check-in", token))
            using (var earlyCheckInResp = await client.SendAsync(earlyCheckInReq))
            {
                Assert.Equal(HttpStatusCode.Conflict, earlyCheckInResp.StatusCode);
                using var doc = JsonDocument.Parse(await earlyCheckInResp.Content.ReadAsStringAsync());
                Assert.Equal("too_early_to_check_in", doc.RootElement.GetProperty("code").GetString());
            }

            // 3. Check in near appointment (1 hour away, within 2h window) -> 204 No Content
            using (var okCheckInReq = CreateAuthReq(HttpMethod.Post, $"/v1/me/appointments/{nearApptId}/check-in", token))
            using (var okCheckInResp = await client.SendAsync(okCheckInReq))
            {
                Assert.Equal(HttpStatusCode.NoContent, okCheckInResp.StatusCode);
            }
        }
        finally
        {
            await conn.ExecuteAsync(
                "delete from public.queue_entries where appointment_id in (@nearApptId, @farApptId); delete from public.appointments where id in (@nearApptId, @farApptId);",
                new { nearApptId, farApptId });
        }
    }

    [Fact]
    public async Task PopiaExportAndAccountDelete_EnforcesAttachmentNoStore_HasRecords_SoleOwner_AndDeletesCleanAccount()
    {
        await using var conn = new NpgsqlConnection(db.SuperuserConnectionString);
        await conn.OpenAsync();

        var cleanUser = Guid.NewGuid();
        var retainedUser = Guid.NewGuid();
        var mktReqId = Guid.NewGuid();
        var mktServiceId = Guid.NewGuid();

        await conn.ExecuteAsync(
            """
            insert into auth.users (id, email) values
              (@cleanUser, @cleanEmail),
              (@retainedUser, @retainedEmail);

            insert into public.profiles (id, display_name) values
              (@cleanUser, 'Clean User'),
              (@retainedUser, 'Retained User')
            on conflict (id) do update set display_name = excluded.display_name;

            -- marketing_requests.service_id is NOT NULL and references marketing_services,
            -- which the baseline seed does not populate, so provide a row for this test.
            insert into public.marketing_services (id, slug, name, description) values
              (@mktServiceId, @mktServiceSlug, 'Retained Service', 'Fixture service for POPIA delete test');

            -- Retained record referencing retainedUser via created_by, whose FK to auth.users
            -- is NO ACTION, so deleting the account must raise has_records (SQLSTATE 23503).
            insert into public.marketing_requests (
              id, practice_id, service_id, created_by, status, title, brief
            ) values (
              @mktReqId, @practiceId, @mktServiceId, @retainedUser, 'draft', 'Retained Brief',
              'Brief retained so the account delete is refused.'
            );
            """,
            new
            {
                cleanUser,
                cleanEmail = $"clean-{cleanUser:N}@example.test",
                retainedUser,
                retainedEmail = $"retained-{retainedUser:N}@example.test",
                mktReqId,
                mktServiceId,
                mktServiceSlug = $"retained-{mktServiceId:N}",
                practiceId = PostgresDatabaseFixture.PracticeA
            });

        try
        {
            await using var factory = new BabyBlueApiFactory(db.BbApiConnectionString);
            using var client = factory.CreateDefaultHostClient("babyblue.co.za");

            // 1. POPIA s23 Export -> 200 OK with Content-Disposition attachment & Cache-Control: no-store
            var c1Token = JwtTestTokenBuilder.CreateToken(PostgresDatabaseFixture.Consumer1);
            using (var exportReq = CreateAuthReq(HttpMethod.Get, "/v1/me/export", c1Token))
            using (var exportResp = await client.SendAsync(exportReq))
            {
                Assert.Equal(HttpStatusCode.OK, exportResp.StatusCode);
                Assert.Equal(
                    "attachment; filename=\"babyblue-export.json\"",
                    exportResp.Content.Headers.ContentDisposition?.ToString()
                    ?? exportResp.Headers.GetValues("Content-Disposition").Single());
                Assert.Contains("no-store", exportResp.Headers.CacheControl?.ToString() ?? string.Empty);

                using var doc = JsonDocument.Parse(await exportResp.Content.ReadAsStringAsync());
                Assert.True(doc.RootElement.TryGetProperty("exported_at", out _));
                Assert.True(doc.RootElement.TryGetProperty("profile", out _));
                Assert.True(doc.RootElement.TryGetProperty("appointments", out _));
            }

            // 2. POPIA s14 Delete for sole owner (OwnerA) -> 409 sole_owner
            var ownerToken = JwtTestTokenBuilder.CreateToken(PostgresDatabaseFixture.OwnerA);
            using (var ownerDelReq = CreateAuthReq(HttpMethod.Delete, "/v1/me", ownerToken))
            using (var ownerDelResp = await client.SendAsync(ownerDelReq))
            {
                Assert.Equal(HttpStatusCode.Conflict, ownerDelResp.StatusCode);
                using var doc = JsonDocument.Parse(await ownerDelResp.Content.ReadAsStringAsync());
                Assert.Equal("sole_owner", doc.RootElement.GetProperty("code").GetString());
            }

            // 3. POPIA s14 Delete for user with retained records -> 409 has_records (Finding F-10)
            var retainedToken = JwtTestTokenBuilder.CreateToken(retainedUser);
            using (var retainedDelReq = CreateAuthReq(HttpMethod.Delete, "/v1/me", retainedToken))
            using (var retainedDelResp = await client.SendAsync(retainedDelReq))
            {
                Assert.Equal(HttpStatusCode.Conflict, retainedDelResp.StatusCode);
                using var doc = JsonDocument.Parse(await retainedDelResp.Content.ReadAsStringAsync());
                Assert.Equal("has_records", doc.RootElement.GetProperty("code").GetString());
            }

            // 4. POPIA s14 Delete for clean user -> 204 No Content
            var cleanToken = JwtTestTokenBuilder.CreateToken(cleanUser);
            using (var cleanDelReq = CreateAuthReq(HttpMethod.Delete, "/v1/me", cleanToken))
            using (var cleanDelResp = await client.SendAsync(cleanDelReq))
            {
                Assert.Equal(HttpStatusCode.NoContent, cleanDelResp.StatusCode);
            }
        }
        finally
        {
            await conn.ExecuteAsync(
                """
                delete from public.marketing_requests where id = @mktReqId;
                delete from public.marketing_services where id = @mktServiceId;
                delete from auth.users where id in (@cleanUser, @retainedUser);
                """,
                new { mktReqId, mktServiceId, cleanUser, retainedUser });
        }
    }

    private static HttpRequestMessage CreateAuthReq(HttpMethod method, string path, string token, object? body = null)
    {
        var req = new HttpRequestMessage(method, path);
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        if (body is not null)
        {
            req.Content = JsonContent.Create(body);
        }

        return req;
    }
}
