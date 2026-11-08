# BabyBlue API: NestJS Rebuild — Implementation Plan

**Status:** Planning. The production API today is `api_dotnet/` (ASP.NET Core 10 / Npgsql / Dapper), already built, already merged, already serving both first-party Next.js frontends. This plan rebuilds the same API surface on NestJS/Node, using `api_dotnet/` as the literal blueprint — **this is a reimplementation on a different stack, not a redesign.** Every route, procedure, rate limit, cache policy, error code and business rule carries over value-for-value unless a section below says otherwise.

**Generic template used as the engineering baseline:** `nestjs-api-implementation-spec.md` (repo root). That document assumes SQL Server + `mssql` + self-issued JWT auth — none of which match BabyBlue. Section 1 below enumerates every point where this plan **overrides** that template. Treat the template as the source for layering discipline, NestJS/Fastify tooling conventions, testing structure and delivery-phase shape; treat `api_dotnet/` as the source for what the API actually has to do.

---

## 0. Why this is not a greenfield build

The .NET API is live. It has 106 endpoints over 106 Postgres procedures, wired to `src/lib/api/*` in the Next.js frontend(s), with its own migrations already applied (`supabase/migrations/0006_api_role_and_brand_registry.sql`, `0007_4nf_and_106_procedures.sql`), its own `bb_api` role, brand registry, and RLS posture already in production. Nothing about the database changes here. Phase 0 of this plan is therefore **narrower** than Phase 0 of the .NET plan (`docs/plans/api/PHASE_0_PREREQUISITES_AND_FOUNDATION.md`): it does not create the role, the registry, or any grants — it validates them from the Node side and scaffolds the Node project.

---

## 1. Deliberate departures from `nestjs-api-implementation-spec.md`

| Template assumption (Section ref) | What BabyBlue actually has | This plan's decision |
|---|---|---|
| SQL Server, `mssql` driver, `StoredProcRunner`, THROW 51xxx convention (§5) | PostgreSQL via Supabase, Postgres functions (`security definer`, `set search_path`), SQLSTATE + message-text error convention | Replace the entire database layer with a `ProcedureGateway` built on **`pg`** (node-postgres), not `postgres.js`. **Reason:** `pg.Pool`'s explicit `connect()`/`query()`/`release()` client lifecycle is the closest structural match to `NpgsqlDataSource`/`Npgsql​Connection`, and `pg`'s `error.code` (SQLSTATE) + `error.constraint` fields map 1:1 onto `PostgresException.SqlState`/`ConstraintName`, which `ProblemDetailsExceptionHandler`'s resolution order depends on. `postgres.js`'s tagged-template API would work but obscures the explicit transaction/session boundary this architecture is built around. |
| Self-issued JWT, argon2, `/auth/login` + `/auth/refresh` + `/auth/logout` (§8.3) | Supabase Auth issues tokens directly to both frontends; the API only ever verifies | **Strike Section 8.3 entirely.** There is no `auth` module with login/refresh endpoints. `AuthGuard` verifies Supabase-issued JWTs (JWKS or shared secret) and nothing else. See Phase 1 §2.4. |
| camelCase JSON properties (§6) | The live .NET API serialises `JsonNamingPolicy.SnakeCaseLower`; `src/lib/api/*` and `src/lib/api/messages.ts` already parse snake_case | **Override to snake_case**, globally, via a Fastify/Nest serialization hook. Getting this wrong breaks every existing frontend call site silently — see the response-envelope decision below. |
| `{ "data": ... }` / `{ "data": ..., "meta": {...} }` success envelope (§7.3) | The .NET API returns rows/DTOs **unwrapped** — `GET /v1/me/profile` returns the profile object directly, not `{ "data": { ... } }` | **Decision (confirmed): do not use the generic envelope.** Match the .NET contract exactly: success responses are the raw payload (array, object, or scalar wrapper object like `{ "id": "..." }` / `{ "count": 5 }` / `{ "role": "..." }` per the .NET route tables), 204 for no-content writes. This is a hard constraint, not a style choice: `src/lib/api/http.ts` is not being rewritten; if this plan's envelope differed from what it already parses, every endpoint would break at runtime with no compile-time signal. |
| `BusinessRuleException` / generic error-codes file invented per-project (§7.5) | A fixed, already-designed vocabulary of ~30 codes exists today in `ProblemDetailsExceptionHandler.Codes`/`TransportCodes`, already matched by `src/lib/api/messages.ts` | **Port the table verbatim** (Phase 1 §2.5). Do not invent new codes; do not rename existing ones. |
| Module generation recipe assumes the owner fills in Section 1 SP catalogue by hand (§1.6, §9) | 106 procedures already exist and are introspectable from `pg_proc` today | **Generate, don't hand-write**, via a `ContractGen`-equivalent script (Phase 1 §2.3) — the same build-failing assertions the .NET `BabyBlue.ContractGen` has (exact count, no `PUBLIC` grant, missing role grant, unmapped type) apply here unchanged. |

Everything the template does not speak to — rate limiting policy values, output-cache policies/keys/tags, security headers, dynamic per-brand CORS, binary upload/download safety, observability shape, the 6 production alerts, and all business rules (sole-owner guard, consent-as-event-series, booking concurrency, queue call-next, POPIA export/delete, slot-hold quota) — is ported from `api_dotnet` unchanged. Where the .NET plan names a Finding (F-01…F-15+) or Decision (D-05, D-06, D-07, D-16, D-17, D-21, D-22, D-29, D-30, D-31), the matching NestJS phase file cites it by number rather than re-deriving it, so nothing already learned gets silently dropped.

---

## 2. Decided: cutover strategy

**Decision (confirmed): (a) Big-bang replace-then-switch.** Build the complete NestJS API to parity behind its own deployment (a separate Vercel/Render/Fly service, or a feature-flagged route on the same domain), run the full exit-gate suite from every phase below plus the Phase 5 Definition of Done, then flip the reverse-proxy/DNS target from `api_dotnet` to the NestJS service in one change, and retire `api_dotnet/`.
- *Why:* the API has exactly two consumers today — `client-web` and `admin-dashboard`, both first-party, both redeployable in the same change. There is no third-party integrator depending on API stability mid-migration, so there is little to gain from a slower incremental cutover and a real cost to running two parallel error-mapping/rate-limiting/caching stacks in production simultaneously (two places for the 3-way error-code parity test to drift, two places to tune the 6 alerts).
- The rejected alternative — an incremental strangler routing specific route groups (e.g. `/v1/directory/*`, `/v1/queue/*`) to NestJS while the rest stayed on `api_dotnet` — would have been the right call if `api_dotnet` needed to keep receiving independent fixes mid-rebuild, or if the team wanted production traffic validating each phase before the next shipped. Neither applies here.

Phase sequencing below reflects this: each phase ends with an "exit gate" (parity proof), not a "traffic cutover" step, and the actual cutover is a single step at the start of Phase 5 §6 once Phases 2-4's exit gates all pass.

---

## 3. Phase list

| Phase | File | Scope | Depends on |
|---|---|---|---|
| 0 | [`PHASE_0_FOUNDATION_AND_SESSION_CONTEXT.md`](PHASE_0_FOUNDATION_AND_SESSION_CONTEXT.md) | Node/NestJS project skeleton, `pg` pool, `SessionContext` (session preamble), `CallerContext` via `AsyncLocalStorage`, DB posture startup check | Existing `supabase/migrations/0006`, `0007` (already applied — nothing to do here) |
| 1 | [`PHASE_1_GATEWAY_CODEGEN_AND_PIPELINE.md`](PHASE_1_GATEWAY_CODEGEN_AND_PIPELINE.md) | `ProcedureGateway`, `contract-gen` codegen tool, full middleware pipeline (correlation id → exception filter → security headers → CORS → brand resolution → auth → caller context → rate limit → cache → controllers), error-code table, two vertical-slice routes, pool-isolation gate | Phase 0 |
| 2 | [`PHASE_2_PUBLIC_DIRECTORY_AND_QUEUE.md`](PHASE_2_PUBLIC_DIRECTORY_AND_QUEUE.md) | 10 anonymous/public routes (Directory 6, Queue 4), output caching, IP rate limits, queue-token log redaction | Phase 1 |
| 3 | [`PHASE_3_PATIENT_AND_BOOKING_FLOW.md`](PHASE_3_PATIENT_AND_BOOKING_FLOW.md) | 13 authenticated patient routes, concurrency-safe hold/booking, POPIA s23/s14 | Phase 1 (parallel with 2 & 4) |
| 4 | [`PHASE_4_PRACTICE_OS_ENDPOINTS.md`](PHASE_4_PRACTICE_OS_ENDPOINTS.md) | 62 practice-OS routes across 8 sub-domain controllers | Phase 1 (parallel with 2 & 3) |
| 5 | [`PHASE_5_GROWTH_PLATFORM_AND_CUTOVER.md`](PHASE_5_GROWTH_PLATFORM_AND_CUTOVER.md) | 21 routes (Growth 16, Platform 5), binary upload/download, observability, 3-way error-code parity test, load test, Definition of Done, cutover execution | Phases 2, 3, 4 |

Dependency graph (same shape as the .NET plan): `0 → 1 → {2, 3, 4} → 5`. Phases 2, 3 and 4 are independent of each other once Phase 1's exit gate passes and may be built in parallel / as separate PRs.

---

## 4. Prerequisites before starting Phase 0

1. Repo root restructuring to `client-web/`, `admin-dashboard/`, `api/`, `db/`, `docs/` complete (tracked separately) — this plan's `api/` paths assume the new NestJS project lives at root-level `api/`, replacing the now-empty slot left by the `api/ → api_dotnet/` rename.
2. Read access to the live Supabase project (connection string with `bb_api` credentials, or equivalent read role for local dev against a seeded Postgres).
3. `src/lib/api/http.ts` and `src/lib/api/messages.ts` (or their post-restructure locations under `client-web/`/`admin-dashboard/` shared packages) treated as frozen contracts for this build — read them, don't change their parsing assumptions without updating this plan first.
