# PROGRESS

_Last updated: 2026-11-01. Branch: `main`._

## API Layer — where it stands

**24 of the 106 endpoints are routed.** Phases 0–3 are complete and tested; Phase 4 has one
vertical slice and Phase 5 is not started. All 106 procedures already exist in
`Procedures.g.cs`, so what is missing from Phases 4–5 is controllers, not database work.

| Phase | Scope | Endpoints | State |
|---|---|---|---|
| 0 | Prerequisites, scaffold, `SessionContext` | — | **Done** (2026-10-31) |
| 1 | Gateway, `ContractGen`, pipeline, isolation gate | 2 slices | **Done** (2026-10-31) |
| 2 | Public directory & queue, output caching | 10 / 10 | **Done** (2026-10-31) |
| 3 | Patient & booking flow | 13 / 13 | **Done** (2026-11-01) |
| 4 | Practice OS, 8 controllers | 62 / 62 | **Endpoints done**; UI migration (§3) outstanding |
| 5 | Growth, Platform, observability, cutover | 21 / 21 | **Endpoints + observability done**; UI (§5), load test, alerts outstanding |

**All 106 endpoints are routed.** Asserted from the running application's API Explorer, not from
the source, so a controller that compiles but is never discovered would fail the check
(`DefinitionOfDoneTests`). Test counts as of 2026-11-01: **90** xUnit unit tests, **56**
PostgreSQL integration tests, **176** Vitest tests. `npx tsc --noEmit` is clean. CI runs all of it
(`.github/workflows/ci.yml`).

## API Layer Phase 5 — Growth, Platform & observability (2026-11-01)

`GrowthController` (16) and `PlatformController` (5) complete the surface at **106 of 106**.

**Growth.** Only listing and creating a request are nested under a practice, because only those
two procedures take `p_practice`. The other fourteen take a request id and
`_require_request_access` resolves the practice from it — which it must, since a
`marketing_operator` is authorised on a request without being a member of the practice that owns
it. Nesting them under `/v1/practices/{p}` would imply a membership check that is deliberately
not the rule.

**Platform.** No `[Authorize(Roles = ...)]` anywhere. `is_platform_admin()` inside each procedure
reads `public.platform_roles`; an attribute here would be a second gate keyed on a JWT claim the
database never consults, so the two could disagree — and the attribute would be the one an
attacker can influence.

### Changed to match the spec

- **`RequireBrandFeature` gained `DefaultEnabled`, and Growth sets it to `false`.** §14 requires
  that a brand without Growth receives `404`, never `403` — "a brand without Growth should not
  learn that Growth exists" — and that is only true if silence in the `features` document means
  off. The attribute previously defaulted every feature to *on*, so a brand created before the
  `growth` key existed would have been handed the module. The always-present modules (directory,
  booking, flow) keep `DefaultEnabled = true`, so an older brand cannot lose one it was using.
- **`growth_approval_decide` is routed as `POST /v1/growth/approvals/{aid}/decide`**, not nested
  under its request as the plan's table had it. The procedure takes only `p_approval` and resolves
  the request and practice from it, so a request id in the path would be a segment nothing reads
  — the same dead-parameter problem as the `city` query key removed earlier.
- **`growth_request_create` takes a `service_id` uuid**, plus a title, min/max budget and
  deadline. The plan's table said `ServiceSlug`, `Brief`, `BudgetCents`.

### Binary assets

Upload streams in chunks and refuses at 5 MiB **before** buffering the rest, so an oversized
upload cannot be used to make the server hold it just to reject it. `size_bytes` is the measured
count, never `IFormFile.Length` and never a client field (F-13) — a test posts 6 MiB with a
declared length of `1` and asserts `413 asset_too_large` with nothing stored.

Download carries four independent reasons a stored asset cannot execute in a viewer's browser:
an allowlisted media type (anything else is downgraded to `application/octet-stream`),
`Content-Disposition: attachment`, `X-Content-Type-Options: nosniff`, and `Cache-Control:
no-store`. The test uploads `evil.html` declaring `text/html` and asserts it comes back as opaque
bytes — because an asset is content from one tenant fetched by another on a shared API origin,
and `inline` there would be stored XSS on `api.babyblue.co.za`.

Global Kestrel `MaxRequestBodySize` is now **64 KiB**, with the one multipart route raising its
own ceiling via `[RequestSizeLimit]`. The 30 MB default would let any JSON endpoint buffer 30 MB
before a controller saw it.

### Observability (§16)

- **Serilog** with compact JSON to stdout, and the URL-printing framework loggers
  (`Hosting.Diagnostics`, `Routing`, `Npgsql`) held at Warning. On this API a raw path *is*
  personal data — it carries appointment ids, client ids and queue tokens — so the single
  access-log line comes from `RequestLoggingMiddleware` and uses the route *template* plus an
  HMAC of the user id.
- **OpenTelemetry** tracing over the `ActivitySource` `ProcedureGateway` already emitted: one
  server span per request tagged with `http.route`, one child span per procedure call tagged
  `db.operation` and `bb.brand`. `url.full` and `url.query` are explicitly nulled, and no SQL
  text or parameter value is ever tagged. No exporter is registered unless
  `Observability:OtlpEndpoint` is set, so a missing collector cannot fail startup or block
  requests.

### Phase 5 gates that pass (10 tests)

- All 16 Growth routes return `404` — never `403` — for a brand whose `features` document does
  not grant Growth.
- All 5 Platform routes return `403` for a genuine practice owner, and the practice is asserted
  still `active` afterwards.
- A real platform admin reads the overview, and the audit log pages by **keyset**: the second page
  shares no entry with the first and every entry is strictly older than the cursor.
- Asset round trip with the four security headers and the media-type downgrade.
- A practice owner cannot upload a `deliverable` (`403`) — otherwise a practice could mark its own
  work delivered.
- 6 MiB upload with a declared length of 1 → `413 asset_too_large`, nothing stored.
- The Growth state machine allows the practice's `draft → submitted` and refuses
  `submitted → in_review`, which is the operator's move; an unknown label is refused at the edge
  as `400 invalid_argument` rather than reaching the database as SQLSTATE `22P02`, which maps to
  no documented code.
- Every authenticated response carries `Cache-Control: no-store`; the same public read is
  cacheable anonymously and `no-store` with a token.

### Definition of Done (§26) — current state

Verified in code (`DefinitionOfDoneTests`, plus the suites above):

- [x] All **106** procedures routed under `/v1`, counted from the running app's API Explorer.
- [x] `MaxPoolSize = 1` cross-brand / cross-user pool isolation.
- [x] 3-way error-code parity (`tests/unit/error-codes.test.ts`).
- [x] No function in `public` is executable by `PUBLIC` — asserted from the database, independently
      of the generator's own assertion.
- [x] No Supabase `service_role` key in configuration.
- [x] `bb_api` owns zero objects, holds zero direct table grants, is `noinherit`, `nobypassrls`,
      and cannot assume `service_role`.
- [x] Every authenticated response carries `Cache-Control: no-store`.
- [x] Asset downloads are `attachment` + `nosniff`; owner uploading `deliverable` is `403`.
- [x] A brand without `features.growth` gets `404` on all 16 Growth routes.
- [x] Error responses on cross-origin requests carry both CORS and security headers.
- [x] Every route table matches its procedure signature — the generated contracts compile with no
      hand-editing, and no DTO accepts a field with no procedure parameter.
- [x] D-30, D-31, D-32, D-33 recorded; `ARCHITECTURE.md` updated.

Still open, and each needs something a test cannot supply:

- [ ] `grep -rE "select |insert |update |delete " src/app src/components` is **not** clean —
      Phase 4 §3 and Phase 5 §5 (the Practice OS, Growth and admin UI migrations) are outstanding.
      The CI gate is scoped to `src/app/patient` until they land.
- [ ] The **640-practitioner load test** (p99 budgets, zero `53300`) — needs a seeded corpus and a
      run; not written.
- [ ] The **six production alerts** — need a staging environment to provision and fire-test.
- [ ] **Stage 5 `revoke`** on tenant tables from `anon` and `authenticated`. The API no longer
      needs those grants, but the PGlite TypeScript suite and the un-migrated Practice OS still
      use them, so this cannot run until the UI migrations are done.
- [ ] **Decision 1** (hosting provider and region) still blocks go-live, and now also supplies the
      `Network:KnownProxies` values D-33 requires.

## API Layer Phase 4 — Practice OS endpoints (2026-11-01)

All **62 endpoints** across the 8 controllers named in the plan, so the routed surface is now 85
of 106. Only Growth (16) and Platform (5) remain.

| Controller | Routes | Notable |
|---|---|---|
| `PracticeContextController` | 11 | Dashboard and insights returned verbatim as `jsonb` (§15); calendar windows capped at 90 days |
| `PracticeTeamController` | 12 | `sole_owner` on the last owner; evicts the public practitioner and facet cache tags |
| `PracticeServicesController` | 5 | `price_required`, `last_practitioner`, `service_in_use` |
| `PracticeAvailabilityController` | 6 | `start_time`/`end_time` as text, never `timerange` |
| `PracticeClientsController` | 9 | Append-only consent series; typeahead on its own limiter |
| `PracticeQueueController` | 5 | Gated on the `flow` brand feature; `call-next` is non-idempotent |
| `PracticeAppointmentsController` | 7 | The only raise site for `consent_required` |
| `PracticeSettingsController` | 7 | Both creation routes on the 3/day `PracticeCreate` limiter |

**All 8 exit gates pass** (`Phase4PracticeRoutesTests`, 15 tests):

- Cross-practice isolation swept over **all 58 practice-scoped routes** — a legitimate owner of
  another practice gets `403 forbidden` on every one. Each route is sent a validly shaped body,
  because an empty body returns `400` from model validation and would have made the sweep prove
  nothing about authorisation.
- Lesser-role denial on the four owner-only mutations with a receptionist's token.
- Sole-owner demotion to `409 sole_owner`, with the role asserted unchanged afterwards. This
  closes the Stage 0 bug where the OS wrote `update practice_members set role` from the browser.
- Consent is append-only **and the newest event governs**: grant then book, withdraw then
  `409 consent_required`, re-grant then book, with all three events still in the series. The
  guard reads `order by at desc, id desc limit 1`, which is the property that makes an
  append-only log a safety property rather than just a record.
- `price_required` on an active service with no price — and the same service accepted while
  inactive, which is what makes the guard conditional rather than a `NOT NULL`.
- `service_in_use` and `last_practitioner` both refused while a future booking exists, then both
  allowed once it is cancelled.
- Two concurrent `POST /queue/call-next` claim two **distinct** entries (`for update skip locked`).
- Time off resolves its window in the practice's own timezone: in `Africa/Lagos` a leave day
  starts at `23:00Z` the previous day, and the test asserts it is *not* the `+02:00` answer a
  hard-coded offset would give.
- A 4th `POST /v1/practices` in a day returns `429`.

### Two contract bugs found while building

- **`practice_appointment_create` accepts a `source` of only `os` or `flow`** and raises
  `forbidden` for anything else — `app` is reserved for `patient_appointment_book`, so staff
  cannot forge a booking as having come from the patient's own app. The first draft of
  `CreatePracticeAppointmentRequest` allowed `walk_in`/`phone`/`staff`/`app`, every one of which
  would have produced a confusing `403`. Caught by the consent gate.
- **Five of the plan's Phase 4 route tables disagreed with the procedure signatures** — the same
  F-12 class of drift the plan itself documents. The signature won in every case, because
  `ContractGen` derives the C# from `pg_proc`:
  - `practice_calendar_appointments` takes `p_include_cancelled` and **no** practitioner; the
    plan specified a `practitioner` filter that does not exist. Same for
    `practice_calendar_availability` and `practice_calendar_timeoff`.
  - `practice_practitioner_create` takes `p_speciality_slug` and `p_user_id`, not `Speciality`
    and `ListingStatus`.
  - `practice_member_add` returns `uuid` (so `201` with the id), while
    `practice_registration_submit` returns `void` (so `204`, not the `201` the table suggested).
  - `practice_appointment_slots` takes a single `p_day date`, not a range, and returns its own row
    type rather than `PublicSlotRow`.
  - `practice_timeoff_add` takes `date` bounds, not `timestamptz`. Exit gate 6 was written around
    `DateTimeOffset`; it is now asserted on the stored `tstzrange` bounds instead, which tests the
    same property (that the offset comes from `practices.timezone`) through the shape that exists.
- `PgEnums` moved from `BabyBlue.Data` to `BabyBlue.Contracts.Generated`, because request DTOs
  need it for `[AllowedValues]` and Contracts may not reference Data (§2 rule 3).

### Phase 4 §3 — Practice OS UI migration: not started, and larger than a swap

The plan's §3 asks for `src/lib/api/practice.ts` and the removal of inline SQL from
`src/app/practice/*`. Sizing it surfaced something the plan does not account for: **the Practice
OS does not call the new 106 procedures at all.** It calls the pre-Stage-3 legacy functions, which
is why migration 0007 deliberately re-grants them and why `ContractGen`'s Assertion 5 pins them.

So this is a rewrite per page, not a transport swap, and two pages change shape rather than
plumbing:

| UI calls today | Phase 4 endpoint | Shape change |
|---|---|---|
| `practice_stats` | `GET .../dashboard` | **Tabular to a single `jsonb` document** |
| `practice_insights` | `GET .../insights` | **Tabular to a single `jsonb` document** |
| `practice_team` | `GET .../members` | Columns differ |
| `staff_create_appointment` | `POST .../appointments` | Takes a `client_id`; consent now enforced |
| `set_appointment_status` | `PUT .../appointments/{id}/status` | — |
| `get_available_slots` | `GET .../appointments/slots` | One day per call, not a range |
| `add_practice_member_by_email` | `POST .../members` | — |
| `remove_practice_member` | `DELETE .../members/{userId}` | — |
| `queue_add_walkin` / `queue_set_status` | `POST .../queue/walk-ins` / `PUT .../queue/{id}/status` | — |
| `create_practice` / `activate_practice` | `POST /v1/practices` / `POST /v1/practices/onboard` | Onboarding is now one transaction |
| `appointment_history` | `GET .../appointments/{id}/history` | — |
| `cancel_appointment` / `reschedule_appointment` | `POST .../{id}/cancel` / `/reschedule` | Staff bypass the patient cancellation window |

Scope: roughly 2,100 lines across 15 files (`calendar`, `clients`, `clients/[id]`, `insights`,
`onboarding`, the dashboard, `queue`, `services`, `settings`, `team`, plus `AppointmentDrawer`,
`CommandPalette`, `NewAppointmentModal`, `OsContext`, `OsRoot`). `admin`, `growth` and `operator`
are excluded — the plan places them in Phase 5. The dashboard and insights pages need a rendering
decision, not just a client swap, because they move from rows to a document.

Until this lands, the Phase 4 exit criterion "zero SQL in `src/app/practice/*`" is unmet and the
CI no-SQL gate stays scoped to `src/app/patient`.

## API Layer review and remediation (2026-11-01)

A review of `API_IMPLEMENTATION_PLAN.md`, `API_LAYER_SPEC.md` and the `api/` tree against the
implementation found the following. All are fixed; each has a regression test unless noted.

**Would have broken in production**

- **Client address was never taken from `X-Forwarded-For`.** Every IP rate limiter partitioned
  on `ctx.Connection.RemoteIpAddress`, which behind a load balancer is the balancer. `QueueJoin`
  would have been three joins per hour for an entire brand. Fixed with an explicitly configured
  proxy boundary that fails startup rather than trusting a spoofable header, plus `/64`
  partitioning for IPv6 (D-33).
- **`src/lib/api/patient.ts` did not compile.** All thirteen remote-mode calls were written
  against a `call(method, path, body)` signature that `http.ts` does not have, and none passed a
  bearer token. `npm test` does not typecheck and nothing imported them, so the whole remote
  patient flow was broken with a green suite. Fixed and covered by `tests/unit/api-client.test.ts`,
  which asserts the method, path, body and `Authorization` header of every call.
- **An empty configuration value read as a configured one.** `Supabase:Url` was read with `??`,
  which does not catch `""`, so an unset environment variable produced the issuer `/auth/v1` and
  rejected every token with a 401 naming no cause. Found by introducing `appsettings.json` with
  placeholder keys, which reproduced it immediately.

**Pre-auth and surface hardening**

- Brand resolution runs before the rate limiter (it must; the partition key needs the brand), so
  an unresolved host bought an unauthenticated caller a connection, a transaction and a
  `resolve_brand` call, on an unbounded shared cache. Now a syntactic host pre-filter plus a
  capped, dedicated cache.
- `X-Tenant-Host` was honoured on every host, letting a caller reselect its brand on a per-brand
  domain. Now gated on `Network:PlatformApiHosts` (F-07 as built; see the plan).
- `ContractGen` gained **Assertion 5**: the client-reachable function surface must be exactly the
  106 procedures, the internal RLS helpers, and a pinned list of the pre-Stage-3 legacy functions
  that migration 0007 deliberately re-grants for the PGlite suite. Assertions 2 and 3 only ever
  saw generated functions, so a function excluded by name could be granted to `anon` unnoticed.
  The legacy anon surface may now shrink but not silently grow.
- JWT signing algorithms are pinned to the key type (`HS256` for symmetric, `ES256`/`RS256` for
  JWKS), and a symmetric secret outside Development now fails startup unless accepted explicitly.

**Contract and correctness**

- The **3-way error-code parity gate the docs claimed existed now exists**
  (`tests/unit/error-codes.test.ts`): the SQL `raise exception` literals, the API's `Codes` table
  and the TypeScript vocabulary are asserted equal at 29 codes, and every code the API can emit
  must have prose.
- **13 codes the API emits had no user-facing prose**, so `ApiError` rendered the raw machine
  string. The sharpest case: the 11th slot hold returned `rate_limited`, showing a patient the
  literal text "rate_limited" while the crafted `too_many_holds` message was unreachable, because
  the HTTP limiter always fires before the database trigger. The `SlotHold` policy now reports
  the quota's own code.
- `GET /v1/directory/specialities` advertised a `city` filter that `public_speciality_list()`
  cannot apply; it was also a cache vary-key, so each value forked an identical body. Removed.
- `patient_appointments_list`'s `p_scope` falls through to `else true`, so `?scope=garbage`
  silently returned everything. Now `[AllowedValues]`. The C# `Skip`/`Take` paging on that route
  is gone: it clipped rows after fetching them all and did not mirror a procedure argument.
- `PracticeContextController` had no rate-limit policy and no global limiter exists, so
  `GET /v1/practices` was unlimited. Added.
- `ContractGen` now emits `PgEnums` from `pg_enum`, so a DTO can write
  `[AllowedValues(PgEnums.MarketingStatus)]` instead of retyping labels that drift (§6).

**Repository and process**

- **2,092 of 2,182 staged files were a vendored NuGet cache (186 MB of `.dll` and `.nupkg`),**
  plus a stray `Library/Application Support/` — artifacts of running `dotnet` with a redirected
  `HOME`. Unstaged and added to `.gitignore` before they could enter history.
- **There was no CI.** The gates the plan calls "hard" — `git diff --exit-code` on `Generated/`,
  the parity test, the no-SQL grep — were all manual. `.github/workflows/ci.yml` now runs the
  web suite, the .NET suites against a real PostgreSQL service, contract regeneration with a
  drift gate, the no-SQL gate scoped to `src/app/patient`, and a guard against tracked binaries.
- The repaired `PopiaExportAndAccountDelete` test had been failing on its own setup SQL
  (`marketing_requests` has no `objective` or `channels` column and its `service_id` is NOT NULL),
  so the Phase 3 exit gate `DELETE /v1/me → 409 has_records` — the gate that exists to prove
  F-10's restored handler — had never reached its assertion.

### Still open

- **Decision 1** (hosting provider and region under the POPIA s72 determination) blocks go-live
  and now also determines the `Network:KnownProxies` values that D-33 requires.
- The no-SQL CI gate covers `src/app/patient` only. Widen it to `src/app/practice` and
  `src/components/os` as Phases 4–5 migrate them, and to all of `src/app` at the Phase 5 cutover.
- `ContractGen`'s `NullableValueColumnNames` and `SingleRowProcedures` are hand-curated manifests.
  `pg_proc` carries no nullability for `returns table` columns, so a manifest is the only option,
  but the cost should be stated: a new nullable column drifts into a non-nullable C# property and
  fails at runtime in Dapper, not at build time.
- The integration fixture boots PostgreSQL with `initdb`/`pg_ctl` against a Homebrew path list,
  not Testcontainers as earlier notes claimed. CI supplies
  `BABYBLUE_TEST_POSTGRES_ADMIN_CS` instead, which is the supported path.

## API Layer Phase 0 — Prerequisites, Solution Scaffold & `SessionContext` (done, 2026-10-31)

- **Decisions:** Recorded D-30 (ASP.NET Core .NET 10 API layer, zero-authority `bb_api` role, direct PostgreSQL endpoint, `/api/leads` kept in Next.js) and D-31 (`public` schema target during Phases 0–5) in `DECISIONS.md`; updated `ARCHITECTURE.md`.
- **Database migration (`supabase/migrations/0006_api_role_and_brand_registry.sql`):** Created `bb_api` login role (`nosuperuser nocreatedb nocreaterole noinherit nobypassrls connection limit 85`), `public.tenant_brands` and `public.tenant_brand_domains` (RLS forced, direct grants revoked), `public.resolve_brand(text)`, seeded default `babyblue` brand with explicit module `features` JSONB, and added `public.public_city_list()`.
- **`.NET 10` solution (`api/`):** Scaffolded `BabyBlue.Api.sln` with central package management (`Directory.Packages.props`), strict build settings (`Directory.Build.props`), `BabyBlue.Contracts`, `BabyBlue.Data`, `BabyBlue.Api`, `BabyBlue.ContractGen`, `BabyBlue.Api.Tests`, and `BabyBlue.Integration.Tests`.
- **Data & identity foundation:** Implemented `CallerContext`, `ResolvedBrand`, `DbRole`, `ICallerAccessor`, `DataSourceFactory` (enforcing `NoResetOnClose = false`, `IncludeErrorDetail = false`, `SslMode.VerifyFull` in non-dev, and Dapper `JsonbTypeHandler` / `TextArrayTypeHandler` / `DateOnlyTypeHandler`), `DatabaseStartupValidator` (`IHostedLifecycleService` fail-fast role posture check), and `SessionContext.ApplyAsync` (batched `set local` preamble + `set_config(..., is_local: true)`).
- **Verification & exit gate:** Startup role self-check passes; `SessionContext` unit and
  PostgreSQL tests prove the `set local` preamble unwinds on both commit and rollback across a
  single pooled connection. (Counts in this section were superseded on 2026-11-01 — see
  "where it stands" above for current totals.)

## API Layer Phases 1–3 (done, 2026-10-31 to 2026-11-01)

- **Phase 1 — gateway, generator, pipeline:** `ProcedureGateway` (table list, single row, scalar,
  void, with retry confined to `stable` procedures on `40001`/`40P01`); `BabyBlue.ContractGen`
  emitting all 106 procedures from `pg_proc`; the §7 middleware pipeline; `GET /v1/directory/cities`
  and `GET /v1/practices` as vertical slices; `src/lib/api/http.ts`. Exit gate met: the
  `MaxPoolSize=1` cross-user, cross-role and cross-brand pool-isolation tests pass, and an unknown
  host 404s even with a valid token.
- **Phase 2 — public directory & queue (10 endpoints):** `PublicDirectoryController` (6) and
  `PublicQueueController` (4); `OutputCache` policies (`Facets` 1h, `Listing` 60s, `Profile` 5m,
  `QueueInfo` 10s, slots and tokens never); `DirectorySearch` and `QueueJoin` IP limiters; the
  Next.js Server Component migration. Exit gate met: zero personal fields on `anon` responses, no
  request carrying `Authorization` is cached, and `/v1/queue/tokens/*` is absent from access logs.
- **Phase 3 — patient & booking flow (13 endpoints):** `PatientController` (profile, appointments,
  holds, book/cancel/reschedule/check-in, POPIA s23 export and s14 delete); the `SlotHold` limiter;
  `23P01` → `409 slot_unavailable`; `src/app/patient/*` migrated. Exit gate met: the 11th rapid hold
  returns 429, concurrent holds on one slot yield exactly one 201 and one 409, and
  `DELETE /v1/me` returns `409 has_records` when records are retained (this last assertion only
  began running on 2026-11-01 — see the review above).

## Phase 0 — Repository audit (done)

| Area | Finding | Decision |
|---|---|---|
| Framework | Next.js 16 (App Router, Turbopack), React 19, TypeScript, plain CSS | **Reuse.** Right tool; no migration needed. |
| Styling | Hand-written CSS with tokens; no Tailwind | **Keep** (see DECISIONS D-02). Tokens re-based on the new palette. |
| State / data | Entire previous product (BabyBlue queue demo) kept state in `localStorage` — no auth, no server, no database | Demo kept as the **Flow demo**; real backend built separately (`supabase/`). |
| Existing functionality | Queue management demo: patient join/status/intake, staff queue, walk-ins, bookings, patients, settings, intake builder | **Preserved** under `/c`, `/q`, `/staff`, `/find` (fictional data, clearly labelled). Logic informed the Flow schema. |
| Deployment | Vercel project `babyblue-demo` (team `jameel-the-designers-projects`), deployed via CLI, no git integration | Preview deployments only until production promotion is authorised. |
| Git | Local repo, `dev` branch, no remote | Connect remote when chosen. |
| Tests | None | Added Vitest unit + database suites (49 tests). |
| Security | No headers, no server validation | Security headers, server-side validation, RLS-first schema added. |

## Phase 1 — Brand and public website (done, verified visually on desktop and mobile)

- Brand system (tokens, Manrope + Inter, wordmark) — see BRAND.md, DESIGN_SYSTEM.md.
- 13 pages: `/`, `/app`, `/practitioners`, `/os`, `/growth`, `/flow`, `/solutions`, `/pricing`, `/about`, `/contact`, `/privacy`, `/terms` (+ `/popia`).
- Homepage with all 12 requested sections, illustrative device mockups, art-directed photography slots.
- Contact form: accessible, validated client and server side, honeypot, throttling, honest failure states.
- SEO: per-page metadata, canonical URLs, generated Open Graph/Twitter image (`/og`), sitemap, robots (noindex until `ALLOW_INDEXING=true`), JSON-LD.
- Security headers.

## Phase 7 — Front door: public listing pages + hybrid UI (done, 2026-10-28)

Inspired by how SMOMO's client side works (finder-first, browse-before-sign-in, indexable category/city pages), adapted to BabyBlue's rules (D-15 to D-19).

- **Public listing pages:** `/{speciality}` (8), `/{speciality}/{city}` (32) and `/in/{city}` (4), statically generated (44 pages). Unknown slugs are 404s; combinations with nobody listed show an honest empty state, are `noindex` and are left out of the sitemap (checked on a production build with `ALLOW_INDEXING=true`). Breadcrumb JSON-LD, canonical URLs, per-page OG image.
- **Finder** on the homepage and every listing page: speciality + city, only offers choices that lead to a populated page.
- **Hybrid UI ("editorial calm"):** new hero (finder, quick links, art-directed stage with an illustrative phone), tone-tile bento of specialities (marketing site and patient app), city links, squircle practitioner cards, oversized display type, header transparent over the hero and glass on scroll, scroll reveal that never hides content without JavaScript, new "Find care" footer column. Checked at 1280px and 390px, no horizontal overflow, no console errors.
- **Patient app:** hero type, tiles and cards restyled; booking flow untouched and still works from a listing (listing → profile → "Sign in to continue").
- **Tests:** 85 pass (13 new): taxonomy/slugs, collision with existing routes, facets, and a database test that keeps the static facets equal to `search_practitioners`.

### Known limitations (this phase)
- Listing results render client-side from the browser-only database, so the HTML a search engine sees holds the heading, copy and links but not the practitioners. Fine while the site is `noindex` and the data is fictional; moving to Supabase means a server fetch (D-17).
- First visit to a listing waits a few seconds for the demo database to start (skeletons show meanwhile).
- Tiles and the hero stage are photography placeholders (labelled). No licensed photos yet.
- Slot alerts ("no time that suits me?") are not built (D-19).
- The practice OS keeps its previous look.

## Phase 8 — Sign-up rules, "via BabyBlue", real practice directory (2026-10-28)

- **Sign-up** (D-21): name, email, WhatsApp-compatible mobile number, password; no IDs. Phone rules in `src/lib/phone.ts` (30 cases), enforced in the database (migration 0005). Account page and queue-join form follow the same rule.
- **"Via BabyBlue"** (D-22): chip, note and dashboard card in the practice OS; the patient's number is formatted and has a WhatsApp link.
- **Practice directory** (D-23, D-24): `/directory` (search by name or place, type, province, city), `/directory/p/{id}`, a section on listing pages, a home band and a patient-app link. Source: OpenStreetMap via the Overpass API, one pass over all nine provinces: 2,870 raw records, **1,434 kept** after cleaning (774 pharmacies, labs and collection points removed, entries with no phone, website or street removed, 28 duplicates merged). Released as 15 batches (14 of 100, one of 34), **all live in production on 2026-10-28**. Data tests gate every batch.
  - Make-up: 611 hospitals, 448 clinics, 178 doctors, 100 dentists, 26 physiotherapists, 17 optometrists, 13 psychologists, 10 chiropractors, 31 other health professionals. Gauteng 520, Western Cape 305, Eastern Cape 164, KwaZulu-Natal 160, Limpopo 81, Mpumalanga 56, North West 53, Free State 52, Northern Cape 43. 1,045 have a phone number, 315 a website, 1,218 a street address.
  - 126 entries are named after an individual (Dr, Prof, Mr, Mrs, Ms). They use only the business details the practice published. This is the group COMPLIANCE.md flags for attorney review and for a working removal channel.
- **Tests:** unit and database tests for all of the above; the data gate already caught pharmacies mis-filed as clinics.

### Known limitations (this phase)
- Not 3,000: OpenStreetMap does not hold more usable South African practices than this. A national health-facility list or licensed data would add more.
- Private doctors, dentists and physios are thin (a few hundred) because mappers tag hospitals and public clinics far more than private rooms.
- OpenStreetMap entries can be wrong; a few mix up two places. Pages say so and link to the source for fixes.
- No monitored removal channel yet (COMPLIANCE.md): the contact form cannot store messages in production.
- Reception screens in the legacy Flow demo still have optional ID fields.

## Phase 2–5 — Backend foundation (done and tested) / product UI (not started)

Built and verified against a real Postgres engine (PGlite, PostgreSQL 18) — 49 passing tests:

- Schema for practices, practitioners, services, availability, leave, clients, appointments, holds, queue, marketing, leads, audit (`supabase/migrations/0001`).
- Atomic booking: slot holds → booking, DB-level exclusion constraint against double booking, cancellation and reschedule rules (`0002`).
- Default-deny row-level security, least-privilege grants, platform-admin-only verification (`0003`).
- Flow: privacy-safe public queue status.
- Growth: controlled request status transitions, approvals, operator isolation from client data.

**Not built yet** (needs a live Supabase project — see Blockers): consumer sign-up/login and booking screens, OS dashboards/calendar/clients/staff UI, Growth request UI and operator dashboard, Flow wired to the real database, transactional email, error monitoring.

## Bugs found by tests and fixed

1. Verification guard trigger ran as its owner, so it never blocked self-verification → now `SECURITY INVOKER`.
2. Marketing request insert failed because its read policy queried the table it was inserting into → policy evaluated inline.
3. Function `queue_status` collided with enum type of the same name when called with a literal → renamed `get_queue_status`.

## Known limitations

- Photography slots are placeholders; licensed South African photography has to be commissioned (BRAND.md).
- Device mockups are illustrative (labelled as such); they contain no real practitioners, ratings or results.
- Legal pages are drafts pending attorney review; Information Officer not yet appointed.
- Concurrency is proven at the constraint level and by sequential contention in tests. A true multi-connection race test must run against a real Postgres (Supabase local) in CI — PGlite is single-connection.
- Pricing is intentionally unpublished.
- The Flow demo uses browser storage and is not multi-device.

## Blockers needing a decision

1. **Supabase project.** Creating one may carry cost, so it needs authorisation (or give me credentials). Unblocks: working waitlist on the preview, auth, booking, OS, Growth, Flow on real data.
2. ~~Production promotion/DNS~~ **Done 2026-10-28** on the owner's explicit instruction: `dev` → `staging` → `main`, then `main` deployed to `babyblue-demo.vercel.app`. DNS and custom domains untouched. Rollback target (the previous production build, 23 Oct): `babyblue-demo-ct2m9tbm6-jameel-the-designers-projects.vercel.app`.
3. **Transactional email provider** (Resend, Postmark, etc.) and a sending domain.
4. **Photography** and a decision on who verifies practitioners (staff process for checking council registers).
