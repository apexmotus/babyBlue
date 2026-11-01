# Phase 0: Prerequisites, Solution Scaffold & `SessionContext`

**Spec Reference:** [`API_LAYER_SPEC.md`](../../API_LAYER_SPEC.md) §0–§4, §14, §17, §22 (Step 4.0a)
**Depends on:** [`DATABASE_SCHEMA_4NF.md`](../../DATABASE_SCHEMA_4NF.md) (Stage 2) · [`STORED_PROCEDURES.md`](../../STORED_PROCEDURES.md) (Stage 3) · [`MULTITENANCY_PLAN.md`](../../MULTITENANCY_PLAN.md) (Phase 1 schema layout)
**Next Phase:** [`PHASE_1_GATEWAY_GENERATOR_AND_PIPELINE.md`](PHASE_1_GATEWAY_GENERATOR_AND_PIPELINE.md)

---

## 1. Objective

Establish the database security foundation (`bb_api` login role with `noinherit` and `nobypassrls`, the `public.tenant_brands` registry and `public.resolve_brand`), scaffold the `.NET 10` solution enforcing project dependency boundaries, configure the pooled `NpgsqlDataSource`, and implement `SessionContext.ApplyAsync` — the per-transaction `set local` preamble that every single API request relies on.

> **Schema target (F-01, D-31):** Phases 0–5 run against the **`public`** schema. The brand *registry* lands here because brand resolution, dynamic CORS and theming all need it; the **schema move to `bb_babyblue` does not** — it stays as [`MULTITENANCY_PLAN.md`](../../MULTITENANCY_PLAN.md) Phase 1, after the API layer is complete and under test. See [`API_IMPLEMENTATION_PLAN.md`](../../API_IMPLEMENTATION_PLAN.md) §1.3 for the measurement behind that decision. `SessionContext` therefore validates `^(public|bb_[a-z][a-z0-9_]{1,28})$`, so the same preamble serves both layouts unchanged and nothing in this phase has to be rewritten when the move happens.

---

## 2. Entry Criteria & Prerequisites

1. **D-30 recorded in [`DECISIONS.md`](../../DECISIONS.md):** Approving the ASP.NET Core (.NET 10) API layer and updating [`ARCHITECTURE.md`](../../ARCHITECTURE.md).
2. **Stage 1 & Stage 2 migrations applied:** 4NF tables, `force row level security` on personal-data tables, and `revoke execute on all functions ... from public`.
3. **Stage 3 procedures present in `public`:** All 106 procedures from [`STORED_PROCEDURES.md`](../../STORED_PROCEDURES.md) applied as migrations, each `security definer` with `set search_path = public`, each with explicit `revoke ... from public` + `grant execute` to `anon` and/or `authenticated`.
4. **Findings F-08, F-10 and F-13 applied to the Stage 3 migration:** `patient_appointment_get` declares `returns table (...)` rather than `returns setof record` (otherwise `ContractGen` cannot derive its row type in Phase 1); `has_records`, `price_required`, `last_practitioner` and `consent_required` have live raise sites; `growth_asset_add` guards on `octet_length(p_content)`; and `growth_asset_download` already returns `table (file_name, mime, content)` — preceded by `drop function if exists`, because PostgreSQL cannot change a return type in place. All four are already written into [`STORED_PROCEDURES.md`](../../STORED_PROCEDURES.md); this criterion is just the reminder to verify them in the applied migration before Phase 1 generates against the catalogue.

---

## 3. Step-by-Step Implementation Tasks

### 3.1 Database Role & Brand Registry Migration (`supabase/migrations/0006_api_role_and_brand_registry.sql`)

Create the migration establishing:
1. **The `bb_api` login role (`API_LAYER_SPEC.md` §4):**
   ```sql
   do $$
   begin
     if not exists (select 1 from pg_roles where rolname = 'bb_api') then
       create role bb_api with login
         nosuperuser nocreatedb nocreaterole noinherit nobypassrls
         connection limit 85;   -- see the sizing note below
     end if;
   end $$;

   grant anon, authenticated to bb_api;

   alter role bb_api set statement_timeout = '15s';
   alter role bb_api set idle_in_transaction_session_timeout = '30s';
   alter role bb_api set search_path = '';
   ```
   - Verify `bb_api` has **zero** direct table grants and owns **zero** objects.
   - Because `noinherit` is set, any command executed before `set local role authenticated` or `set local role anon` runs as `bb_api` and fails immediately with SQLSTATE `42501`.

   > **Connection-limit sizing (Finding F-15).** The limit and `MaxPoolSize` are one number expressed twice, so derive it rather than picking it: `connection limit >= (instances x MaxPoolSize) + reserve`. At `MaxPoolSize = 40`, a single instance needs 45 and **two instances need 85** — a limit of 60 silently caps horizontal scaling and surfaces as the `53300` alert that Phase 5 §4.3 provisions for exactly this. `reserve` (5) covers `IBrandRegistry` lookups and the startup validator. Confirm the instance count as Decision 7 before merging this migration, and re-run `alter role bb_api connection limit <n>` whenever it changes.

2. **Schema usage grants:**
   ```sql
   grant usage on schema public to anon, authenticated;
   ```

3. **Brand registry tables & `public.resolve_brand(text)` (`MULTITENANCY_PLAN.md` §4, `API_LAYER_SPEC.md` §14):**
   - Create `public.tenant_brands` and `public.tenant_brand_domains` with `revoke all on public.tenant_brands, public.tenant_brand_domains from anon, authenticated, public`.
   - Create `public.resolve_brand(p_host text)` as `security definer set search_path = public`, `revoke all on function public.resolve_brand(text) from public`, and `grant execute on function public.resolve_brand(text) to anon, authenticated`.
   - Seed the default `babyblue` brand with `schema_name = 'public'` (the move to `bb_babyblue` is a one-row update when [`MULTITENANCY_PLAN.md`](../../MULTITENANCY_PLAN.md) Phase 1 lands), `status = 'active'`, and verified domains (`babyblue.co.za`, `localhost`, `127.0.0.1`) for local development and tests.
   - **Seed `features` explicitly, never as `'{}'`.** `tenant_brands.features` defaults to an empty object ([`MULTITENANCY_PLAN.md`](../../MULTITENANCY_PLAN.md) §4), while the phases call `IsFeatureEnabled` with *different* fallbacks — Phase 2 defaults to `true`, Phase 5 defaults growth to `false`. Leaving the column empty makes behaviour depend on the call site rather than on the brand, which is the opposite of the intent. For BabyBlue itself, seed the full set from [`MULTITENANCY_PLAN.md`](../../MULTITENANCY_PLAN.md) §8:
     ```sql
     '{"booking": true, "os": true, "flow": true, "growth": true,
       "directory": true, "public_listings": true,
       "clinical": false, "claims": false, "layout": "standard"}'::jsonb
     ```
     Note `public_listings` (D-16) is seeded here but is **not** yet gated by any route — Phase 2 migrates the `src/app/(site)/[speciality]` pages without checking it. Either add the gate in Phase 2 or record that the flag is informational until the first white-label tenant.

---

### 3.2 Solution & Project Layout (`api/`)

Create the solution structure in `api/` matching `API_LAYER_SPEC.md` §2:

```
api/
  global.json                            # Pins .NET 10.0 SDK (rollForward: latestFeature)
  Directory.Build.props                  # Nullable=enable, ImplicitUsings=enable, TreatWarningsAsErrors=true
  Directory.Packages.props               # Central Package Management (Npgsql 9.x, Dapper 2.x, Serilog, Testcontainers)
  BabyBlue.Api.sln
  src/
    BabyBlue.Contracts/
      BabyBlue.Contracts.csproj          # Zero dependencies on BabyBlue.Data, Npgsql, or Dapper
    BabyBlue.Data/
      BabyBlue.Data.csproj               # References BabyBlue.Contracts, Npgsql, Dapper
    BabyBlue.Api/
      BabyBlue.Api.csproj                # References BabyBlue.Data, BabyBlue.Contracts
  tools/
    BabyBlue.ContractGen/
      BabyBlue.ContractGen.csproj        # Console app reading pg_catalog
  tests/
    BabyBlue.Api.Tests/
      BabyBlue.Api.Tests.csproj          # xUnit + NSubstitute unit tests
    BabyBlue.Integration.Tests/
      BabyBlue.Integration.Tests.csproj  # xUnit + Testcontainers.PostgreSql + WebApplicationFactory
```

#### Structural Enforcement Rules
- Add an architecture unit test in `BabyBlue.Api.Tests` asserting that:
  1. `BabyBlue.Api` assembly references do **not** directly invoke `NpgsqlConnection` or `Dapper.SqlMapper` (all data types in `BabyBlue.Data.Npgsql` are `internal` except DI registration extensions).
  2. `BabyBlue.Contracts` has zero package references to `Npgsql` or `Dapper`.

---

### 3.3 Caller & Brand Context Types (`BabyBlue.Contracts` / `BabyBlue.Data`)

Implement the immutable, request-scoped context types (`API_LAYER_SPEC.md` §3, §14):

```csharp
// api/src/BabyBlue.Contracts/Auth/CallerContext.cs
namespace BabyBlue.Contracts.Auth;

public enum DbRole
{
    Anonymous,
    Authenticated
}

public sealed record ResolvedBrand(
    Guid BrandId,
    string Slug,
    string SchemaName,
    string Status,
    string DisplayName,
    JsonElement Theme,
    JsonElement CopyOverrides,
    JsonElement Features,
    string? LogoUrl,
    string? FaviconUrl,
    string SupportEmail)
{
    public bool IsFeatureEnabled(string featureKey, bool defaultValue = true) =>
        Features.ValueKind == JsonValueKind.Object &&
        Features.TryGetProperty(featureKey, out var prop) &&
        prop.ValueKind is JsonValueKind.True or JsonValueKind.False
            ? prop.GetBoolean()
            : defaultValue;
}

public sealed record CallerContext(
    Guid? UserId,
    DbRole DbRole,
    string ClaimsJson,
    ResolvedBrand Brand,
    string RequestId);
```

And the accessor interface in `BabyBlue.Data`:

```csharp
// api/src/BabyBlue.Data/ICallerAccessor.cs
public interface ICallerAccessor
{
    CallerContext Current { get; }
    string? LastProcedure { get; set; }
}
```

---

### 3.4 Pooled `NpgsqlDataSource` & Startup Self-Check (`BabyBlue.Data/Npgsql/DataSourceFactory.cs`)

Implement `DataSourceFactory.Create` exactly as specified in `API_LAYER_SPEC.md` §4 & §17:

- `Pooling = true`, `MinPoolSize = 5`, `MaxPoolSize = 40` (configurable via strongly-typed `DatabaseOptions` for test override to `MaxPoolSize = 1`).
- `Timeout = 10`, `CommandTimeout = 20` (deliberately above the 15s `statement_timeout` so Postgres raises SQLSTATE `57014` rather than a client-side `OperationCanceledException`).
- `NoResetOnClose = false` (**mandatory**: ensures `DISCARD ALL` runs when connections return to the pool).
- `IncludeErrorDetail = false` (**mandatory**: prevents column values and constraint details from leaking into `PostgresException` messages).
- `SslMode = SslMode.VerifyFull` in non-development environments (configurable to `Prefer`/`Disable` only for local Docker/Testcontainers in `Development`/`Testing`).
- `b.EnableDynamicJson()` and custom Dapper type handlers:
  - `Dapper.DefaultTypeMap.MatchNamesWithUnderscores = true`
  - `JsonbTypeHandler` (`jsonb` ↔ `JsonElement`)
  - `TextArrayTypeHandler` (`text[]` ↔ `string[]`)
  - `DateOnlyTypeHandler` (`date` ↔ `DateOnly`)

#### Startup Fail-Fast Verification (`DatabaseStartupValidator : IHostedLifecycleService`)
At `StartingAsync` (`API_LAYER_SPEC.md` §17), open a connection and run:
```sql
select current_user                                      as current_user,
       (select rolbypassrls from pg_roles where rolname = current_user) as bypass_rls,
       (select rolinherit   from pg_roles where rolname = current_user) as inherit,
       pg_has_role(current_user, 'authenticated', 'member')             as can_assume_authenticated,
       pg_has_role(current_user, 'anon', 'member')                      as can_assume_anon,
       pg_has_role(current_user, 'service_role', 'member')              as can_assume_service_role;
```
Abort startup immediately if:
- `current_user != 'bb_api'`
- `bypass_rls == true` or `inherit == true`
- `can_assume_authenticated == false` or `can_assume_anon == false`
- `can_assume_service_role == true` (proves `bb_api` cannot `SET LOCAL ROLE service_role`).

---

### 3.5 Transaction-Scoped `SessionContext` (`BabyBlue.Data/Npgsql/SessionContext.cs`)

Implement `SessionContext.ApplyAsync` (`API_LAYER_SPEC.md` §3):

```csharp
// api/src/BabyBlue.Data/Npgsql/SessionContext.cs
internal static partial class SessionContext
{
    // `public` is accepted for Phases 0-5 (F-01 / D-31); the bb_* form is accepted so that
    // MULTITENANCY_PLAN.md Phase 1 needs no change here. Anything else is rejected before
    // the string reaches a `set local` statement, which is what makes the interpolation safe.
    [GeneratedRegex(@"^(public|bb_[a-z][a-z0-9_]{1,28})$", RegexOptions.CultureInvariant)]
    private static partial Regex SchemaPattern();

    public static async Task ApplyAsync(
        NpgsqlConnection cx,
        NpgsqlTransaction tx,
        CallerContext caller,
        CancellationToken ct)
    {
        if (!SchemaPattern().IsMatch(caller.Brand.SchemaName))
            throw new InvalidOperationException("invalid_schema");

        var dbRole = caller.DbRole switch
        {
            DbRole.Authenticated => "authenticated",
            DbRole.Anonymous     => "anon",
            _ => throw new InvalidOperationException("invalid_role")
        };

        var budget = caller.DbRole == DbRole.Anonymous ? "5s" : "15s";
        var idleBudget = caller.DbRole == DbRole.Anonymous ? "10s" : "30s";

        // Combine session-local GUC setup into one round-trip on the open transaction:
        await ExecAsync(cx, tx,
            $"""
            set local search_path = {caller.Brand.SchemaName};
            set local role {dbRole};
            set local statement_timeout = '{budget}';
            set local idle_in_transaction_session_timeout = '{idleBudget}';
            """, ct);

        if (caller.UserId is { } uid)
        {
            await using var cmd = new NpgsqlCommand(
                """
                select set_config('request.jwt.claim.sub', @sub, true),
                       set_config('request.jwt.claims',    @claims, true),
                       set_config('application_name',      @app, true)
                """, cx, tx);
            cmd.Parameters.AddWithValue("sub", uid.ToString());
            cmd.Parameters.AddWithValue("claims", caller.ClaimsJson);
            cmd.Parameters.AddWithValue("app", $"bb-api:{caller.RequestId}");
            await cmd.ExecuteNonQueryAsync(ct);
        }
        else
        {
            await using var cmd = new NpgsqlCommand(
                """
                select set_config('request.jwt.claim.sub', '', true),
                       set_config('request.jwt.claims',    '', true),
                       set_config('application_name',      @app, true)
                """, cx, tx);
            cmd.Parameters.AddWithValue("app", $"bb-api:{caller.RequestId}");
            await cmd.ExecuteNonQueryAsync(ct);
        }
    }
}
```
> **Note on batching the preamble:** Batching `set local search_path`, `set local role`, `set local statement_timeout`, and `set local idle_in_transaction_session_timeout` into a single `NpgsqlCommand` cuts 3 local round-trips per transaction down to 1 (2 total with `set_config`), while keeping `SchemaName`, `dbRole`, and `budget` strictly allowlisted/regex-validated and keeping `@sub`, `@claims`, and `@app` parameterised.

> **Note on `search_path`:** the brand schema is set alone, not as `{schema}, public`, so that once the brand schema is `bb_babyblue` a procedure cannot silently resolve a tenant table in `public`. Procedures that legitimately read shared reference data (`countries`, `metric_definitions`) or the registry qualify it explicitly, as they already do in [`STORED_PROCEDURES.md`](../../STORED_PROCEDURES.md). While `SchemaName = 'public'` the two forms are identical, so this costs nothing now and removes a whole class of leak later.

### 3.6 Testcontainers Supabase Bootstrap (`BabyBlue.Integration.Tests/Fixtures/supabase-bootstrap.sql`)

Every one of the 106 procedures depends on Supabase objects that a bare `postgres:17` container does not have: `auth.uid()`, `auth.users` (which `patient_account_delete` deletes from), and the `anon` / `authenticated` / `service_role` roles. Phase 0's exit gate cannot run without them, so this is a task, not an assumption.

[`tests/db/harness.ts`](../../tests/db/harness.ts) already carries exactly this bootstrap as its `SUPABASE_STUBS` constant — port it rather than reinventing it, so the C# integration tests and the existing `vitest` suite are proven against the same stand-in:

```sql
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(),
                         email text, raw_user_meta_data jsonb not null default '{}');
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;   -- bypassrls is what makes the §3.4 check meaningful
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
```

Two details worth keeping:
- `service_role` is created **`bypassrls`** deliberately. Without it, the startup validator's `can_assume_service_role == false` assertion would pass for the wrong reason, and the test would stop proving anything.
- The container needs `btree_gist` (for `no_double_booking`) and `pgcrypto`, matching the extensions [`tests/db/harness.ts`](../../tests/db/harness.ts) loads into PGlite. Use a Postgres image that ships them, or `create extension` in the bootstrap.

---

## 4. Verification & Exit Gate

Phase 0 is complete only when the following automated tests pass in `BabyBlue.Api.Tests` and `BabyBlue.Integration.Tests` (all integration tests run against the §3.6 Supabase bootstrap):

1. **Architecture Boundary Test:** `BabyBlue.Api` cannot reference `NpgsqlConnection` directly; `BabyBlue.Contracts` has no dependency on `BabyBlue.Data`.
2. **Startup Role Validation Test:**
   - Connecting as `postgres` or a role with `rolinherit = true` causes `DatabaseStartupValidator` to throw at startup.
   - Connecting as `bb_api` succeeds and proves `pg_has_role('bb_api', 'service_role', 'member') = false`.
3. **`noinherit` Enforcement Test:** Opening a connection as `bb_api` and calling `select * from public.public_city_list()` *without* calling `SessionContext.ApplyAsync` fails with `PostgresException` SQLSTATE `42501` (`permission denied for function public_city_list`). This is the test that proves the zero-authority posture: `bb_api` holds the `anon` and `authenticated` memberships but inherits nothing from them, so forgetting the preamble fails closed.
4. **`SessionContext` Regex & Role Guard Test:**
   - `SchemaName = "public"` and `SchemaName = "bb_babyblue"` are both accepted (F-01 / D-31).
   - `SchemaName = "pg_catalog"`, `"bb_babyblue; drop table x"`, `"Public"`, `""`, or `"bb_"` throws `InvalidOperationException("invalid_schema")` **before** touching the database.
   - An out-of-range `DbRole` enum value throws `InvalidOperationException("invalid_role")`.
5. **Transaction Unwind Test (`MaxPoolSize = 1`):**
   - Transaction 1 applies `SessionContext` with `UserId = ownerA`, `DbRole = Authenticated`, `SchemaName = "public"`, verifies `auth.uid() = ownerA` and `current_setting('role') = 'authenticated'`, then commits and closes the connection.
   - Transaction 2 opens the *same* physical connection from the size-1 pool and inspects `current_user`, `current_setting('search_path')`, and `current_setting('request.jwt.claim.sub', true)` *before* `SessionContext.ApplyAsync`: asserts `current_user = 'bb_api'`, `search_path = ''`, and `sub = ''`.
