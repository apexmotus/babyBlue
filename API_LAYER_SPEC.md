# BabyBlue API Layer Specification

**Status:** specification. Nothing in this document has been applied to the repository.
**Stack:** ASP.NET Core (.NET 10 LTS), MVC controllers, Dapper over Npgsql, PostgreSQL stored functions.
**Depends on:** [`STORED_PROCEDURES.md`](STORED_PROCEDURES.md) — the 106 procedures are this layer's entire contract.
**Companions:** [`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md) · [`DATABASE_SCHEMA_4NF.md`](DATABASE_SCHEMA_4NF.md) · [`MULTITENANCY_PLAN.md`](MULTITENANCY_PLAN.md) · [`IMPROVEMENT_PLAN.md`](IMPROVEMENT_PLAN.md) · [`ARCHITECTURE.md`](ARCHITECTURE.md)

This document is a build blueprint. It says what the API layer is, what it must never do, and the exact mechanism by which it preserves the security model the database already has. Where it adds a decision that is not in the four existing documents, it says so and marks it for a human.

---

## 0. The concern to state before building

The repository has a standing decision — **D-01: keep Next.js 16 + TypeScript; do not migrate stacks** — and `ARCHITECTURE.md` states that the browser talks to Supabase with the user's JWT, with RLS as the boundary. A .NET API layer is a stack addition and a new deployment unit, and it moves the request path off Vercel for every authenticated call.

That is a real cost, and it is worth naming once: the latency of an extra hop, a second language and CI pipeline, a second hosting region to get right under POPIA, and the loss of Supabase's direct-JWT simplicity. It is not a reason not to build it. The layer buys five things the current shape cannot have at all:

| Gained | Why it is impossible today |
|---|---|
| Per-user rate limiting | The limits in `IMPROVEMENT_PLAN.md` §10 that key on the JWT (`patient_slot_hold` 10/hour/user, `practice_create` 3/day/user) need a server that sees the token. There is none. |
| Server-side caching of public reads | A browser calling Postgres directly cannot share a cache with the next browser. |
| Brand → schema routing | `withBrand()` has to run somewhere trusted. `MULTITENANCY_PLAN.md` §5 puts it in a request handler; this is that handler. |
| One enforceable procedure allowlist | The TypeScript `rpc()` wrapper is an allowlist by convention. A generated gateway is one by compilation. |
| Non-browser clients | A mobile app, a practice's PMS integration, or a claims switch (Stage 8D) cannot hold a Supabase session sensibly. |

**This document assumes the addition is approved.** It requires a new `DECISIONS.md` entry (proposed **D-30**) recording the stack addition, the hosting target and the region, because D-01 and `ARCHITECTURE.md` both become inaccurate the day the first endpoint ships. See §24.

---

## 1. What this layer is

```
Browser / mobile
   │
   │  HTTPS, Supabase access token in Authorization: Bearer
   ▼
Next.js (Vercel)                      ← unchanged: marketing site, static shells,
   │  src/lib/api/* now call the         Server Components, Flow demo
   │  .NET API instead of supabase.rpc
   ▼
BabyBlue.Api  (ASP.NET Core MVC controllers, no views)
   │  1. validate JWT          → uid, role
   │  2. resolve brand by Host → schema_name
   │  3. rate limit            → per user, per practice, per IP
   │  4. open ONE transaction, apply session context with `set local`
   │  5. call ONE procedure through the generated gateway
   │  6. map PostgresException → ProblemDetails with the error code
   ▼
Npgsql pool ──► PostgreSQL (Supabase)
                  bb_babyblue.<procedure>   ← RLS still evaluates auth.uid()
```

The layer is **thin by design**. One HTTP endpoint maps to one procedure call inside one transaction. There is no service layer, no repository per entity, no domain model, and no second copy of any rule that the database already enforces.

### The rule that makes it safe

> **The API is a transport and a policy gate. It is never the authority on who may see what.**

`ARCHITECTURE.md`'s principle — the database is the security boundary — survives this change only if the API passes the caller's identity *through* to the database rather than standing in for it. An API that connects as a privileged role and decides access in C# is a confused deputy: it would make every RLS policy and every `_require_member` check in `STORED_PROCEDURES.md` dead code, and it would reintroduce exactly the single-layer failure mode that D-26 was written to remove. §3 is the mechanism that prevents this, and it is the most important section in this document.

### What this layer must never do

| Prohibited | Why |
|---|---|
| Connect as `postgres`, `service_role`, or any role with `BYPASSRLS` on the request path | Defeats RLS entirely. The one legitimate service-role use (`/api/leads`) is handled in §18. |
| Decide authorisation in C# instead of calling the procedure and handling its `forbidden` | Two authorities disagree eventually; the DB must win, so the DB must be asked. |
| Build SQL from any value that came from a request | The procedure name and the schema name are the only interpolated values anywhere, and both come from compile-time allowlists (§5, §14). |
| `SET` without `local` | Transaction-scoped only. A plain `SET` on a pooled connection leaks the brand or the identity to the next request on that physical connection. This is the worst available bug in the design. |
| Cache any authenticated response | `IMPROVEMENT_PLAN.md` §6: anything behind auth has TTL **never**. |
| Fall back to the default brand on an unknown Host | `MULTITENANCY_PLAN.md` §5 rule 2 — a misconfigured DNS entry would serve BabyBlue's directory under a client's domain. Unknown host is 404. |
| Log a request or response body | Those bodies carry names, phone numbers, consent records and admin notes. §16. |
| Add business logic, validation beyond shape, or derived values | The procedures own the rules. Shape validation (is this a UUID, is this within length) is the API's job; meaning is not. |

---

## 2. Solution layout

```
api/
  BabyBlue.Api.sln
  src/
    BabyBlue.Api/                        ASP.NET Core host — controllers, middleware, DI
      Program.cs
      Controllers/
        PublicDirectoryController.cs     §8 route tables, one controller per domain
        PublicQueueController.cs
        PatientController.cs
        PracticeContextController.cs
        PracticeTeamController.cs
        PracticeServicesController.cs
        PracticeAvailabilityController.cs
        PracticeClientsController.cs
        PracticeAppointmentsController.cs
        PracticeQueueController.cs
        PracticeSettingsController.cs
        GrowthController.cs
        PlatformController.cs
      Middleware/
        BrandResolutionMiddleware.cs     Host → brand, 404 on unknown
        ProblemDetailsExceptionHandler.cs
        CorrelationIdMiddleware.cs
      Auth/
        SupabaseJwtOptions.cs
        CallerContext.cs                 uid, db role, brand — request-scoped, immutable
      RateLimiting/
        BabyBlueRateLimiterPolicies.cs
      Caching/
        PublicReadCache.cs
    BabyBlue.Data/                       the only project that knows SQL exists
      Npgsql/
        DataSourceFactory.cs
        SessionContext.cs                `set local` application — §3
      ProcedureGateway.cs                §5
      ProcedureName.cs                   generated allowlist — §6
      Generated/
        Procedures.g.cs                  generated: 106 typed methods
        Contracts.g.cs                   generated: result records
      TypeHandlers/
        JsonbTypeHandler.cs
        TextArrayTypeHandler.cs
    BabyBlue.Contracts/                  request DTOs + ProblemDetails codes; no DB types
  tools/
    BabyBlue.ContractGen/                reads pg_catalog, writes Generated/ — §6
  tests/
    BabyBlue.Api.Tests/                  controller + middleware unit tests
    BabyBlue.Integration.Tests/          Testcontainers: real migrations, real procedures — §20
```

Three structural rules:

1. **`BabyBlue.Data` is the only project referencing Npgsql or Dapper.** Controllers take a generated procedure method; they cannot reach a connection. A controller that could open a connection could write SQL, and then the allowlist is advisory.
2. **`Generated/` is committed and never hand-edited.** The generator is the authority (§6). A hand edit is a divergence between the C# contract and the database, which is the failure mode D-26 exists to remove.
3. **`BabyBlue.Contracts` has no dependency on `BabyBlue.Data`.** It is the package a mobile client or integration partner could consume.

### Framework choices

| Concern | Choice | Note |
|---|---|---|
| Runtime | .NET 10 (LTS) | Pin in `global.json`. |
| Controllers | `AddControllers()` — attribute routing, no views | "MVC" here means the controller/action pattern; this host renders no HTML. |
| Serialisation | `System.Text.Json`, `JsonNamingPolicy.SnakeCaseLower` | Matches the procedures' column names, so the TypeScript types in `src/lib/api/` stay byte-identical to `STORED_PROCEDURES.md` §20. |
| Data access | Dapper 2.x over Npgsql 9.x, via `NpgsqlDataSource` | §4, §5. |
| Validation | `Microsoft.AspNetCore.Mvc` model validation + `DataAnnotations`, shape only | §9. |
| API description | OpenAPI via `Microsoft.AspNetCore.OpenApi` at `/openapi/v1.json` | Non-production environments only. |
| Logging | `Serilog` → OpenTelemetry OTLP; Sentry for exceptions | `IMPROVEMENT_PLAN.md` §13. |
| Resilience | `Microsoft.Extensions.Http.Resilience` is **not** needed — there are no outbound HTTP calls on the request path | Retries against the database are handled in §4. |

---

## 3. Identity: the mechanism everything rests on

Every one of the 106 procedures authorises against `auth.uid()`. In Supabase, `auth.uid()` reads the current transaction's GUCs:

```sql
-- effectively what Supabase's auth.uid() does
select coalesce(
  nullif(current_setting('request.jwt.claim.sub', true), ''),
  nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
)::uuid;
```

A .NET API that connects with its own credentials and does nothing else therefore has `auth.uid() = null`, and **every procedure raises `not_authenticated`**. The entire layer hinges on reproducing, in C#, what `src/local/db.ts` already does per call and what `MULTITENANCY_PLAN.md` §5 specifies for the brand.

### The required preamble

Exactly this, inside the transaction, before the procedure call, in this order:

```csharp
// BabyBlue.Data/Npgsql/SessionContext.cs
internal static class SessionContext
{
    private static readonly Regex SchemaPattern =
        new(@"^bb_[a-z][a-z0-9_]{1,28}$", RegexOptions.Compiled);

    /// <summary>
    /// Applies caller identity, brand schema and statement budget to an OPEN transaction.
    /// Every statement here is `set local` or set_config(..., is_local: true), so all of it
    /// unwinds with the transaction. Nothing survives onto the pooled connection.
    /// </summary>
    public static async Task ApplyAsync(
        NpgsqlConnection cx, NpgsqlTransaction tx, CallerContext caller, CancellationToken ct)
    {
        if (!SchemaPattern.IsMatch(caller.Brand.SchemaName))
            throw new InvalidOperationException("invalid_schema");   // belt and braces; registry already constrains it

        // 1. Brand schema. No parameter placeholder exists for a schema name, so it is
        //    interpolated — which is why the regex above is not optional. The value comes
        //    from tenant_brands.schema_name, never from a request. MULTITENANCY_PLAN §5 rule 3.
        await ExecAsync(cx, tx, $"set local search_path = {caller.Brand.SchemaName}, public", ct);

        // 2. Database role. Allowlisted to exactly two values; `service_role` is unreachable.
        var dbRole = caller.DbRole switch
        {
            DbRole.Authenticated => "authenticated",
            DbRole.Anonymous     => "anon",
            _ => throw new InvalidOperationException("invalid_role")
        };
        await ExecAsync(cx, tx, $"set local role {dbRole}", ct);

        // 3. Statement budget. See the gotcha below — this cannot be left to ALTER ROLE.
        var budget = caller.DbRole == DbRole.Anonymous ? "5s" : "15s";
        await ExecAsync(cx, tx, $"set local statement_timeout = '{budget}'", ct);

        // 4. Identity. Parameterised — these are the only values here that can be.
        //    Both GUCs are set: tests/db/harness.ts reads request.jwt.claim.sub, and any
        //    procedure using auth.jwt() reads request.jwt.claims.
        if (caller.UserId is { } uid)
        {
            await using var cmd = new NpgsqlCommand(
                """
                select set_config('request.jwt.claim.sub', @sub, true),
                       set_config('request.jwt.claims',    @claims, true)
                """, cx, tx);
            cmd.Parameters.AddWithValue("sub", uid.ToString());
            cmd.Parameters.AddWithValue("claims", caller.ClaimsJson);   // minimal: sub, role, email, exp
            await cmd.ExecuteNonQueryAsync(ct);
        }
    }

    private static async Task ExecAsync(
        NpgsqlConnection cx, NpgsqlTransaction tx, string sql, CancellationToken ct)
    {
        await using var cmd = new NpgsqlCommand(sql, cx, tx);
        await cmd.ExecuteNonQueryAsync(ct);
    }
}
```

### Four details that are each a bug if missed

**1. `set local`, never `set`.** Npgsql keeps physical connections in a pool and hands them to the next request. A plain `SET search_path` or `SET ROLE` would persist and the following request — possibly another brand's, possibly anonymous — would run with it. `MULTITENANCY_PLAN.md` §5 calls this "the worst possible bug in this design" for the brand; it is equally true of the role and the identity. Leave Npgsql's `No Reset On Close` at its default (`false`) so `DISCARD ALL` runs anyway as a second line.

**2. `ALTER ROLE authenticated SET statement_timeout` does not apply here.** This is the non-obvious one. `IMPROVEMENT_PLAN.md` §6 sets per-role statement timeouts with `alter role`, which PostgreSQL applies **at login, for the login role**. The API's login role is `bb_api`; `SET ROLE authenticated` later in the session does **not** re-apply `authenticated`'s settings. So the timeouts in `IMPROVEMENT_PLAN.md` §6 are silently inert behind this API unless set per transaction. Hence step 3 above, plus a floor on the login role itself:

```sql
alter role bb_api set statement_timeout = '15s';
alter role bb_api set idle_in_transaction_session_timeout = '30s';
```

The same applies to `idle_in_transaction_session_timeout`; set it per transaction for the `anon` path (`10s`) if the browser-direct path is ever removed entirely.

**3. One transaction per request, always — even for reads.** `set local` has nothing to scope to outside a transaction, so a read issued without one has no identity and no brand. There is no "fast path" that skips the transaction.

**4. The role mapping is a two-value allowlist, not a claim passthrough.** A token claiming `role: service_role` must be mapped to `authenticated` or rejected, never honoured. Supabase tokens carry a `role` claim; treating it as the database role to assume would let anyone who obtains a service-role token through any route reach every table.

```csharp
// BabyBlue.Api/Auth/CallerContext.cs
public enum DbRole { Anonymous, Authenticated }

public sealed record CallerContext(
    Guid? UserId,
    DbRole DbRole,
    string ClaimsJson,
    ResolvedBrand Brand)
{
    public static DbRole FromToken(ClaimsPrincipal? user) =>
        user?.Identity?.IsAuthenticated == true ? DbRole.Authenticated : DbRole.Anonymous;
        // deliberately ignores the token's `role` claim entirely
}
```

### Why a routing bug degrades safely

`MULTITENANCY_PLAN.md` §3 proved the property that makes this tolerable: a caller whose `search_path` is wrongly pointed at another brand reads **zero rows**, because that schema's RLS still evaluates membership against `auth.uid()`. So a brand-resolution bug in this API produces an empty result, not a cross-brand leak — provided §3 steps 2 and 4 are both applied. If the role were left as `bb_api` with table privileges, that guarantee would be gone. It is the reason for §4's role design.

---

## 4. Connection and pooling model

### The database role

```sql
-- the API's login role: no privileges of its own, must SET ROLE to do anything
create role bb_api with login password :'pw'
  nosuperuser nocreatedb nocreaterole noinherit nobypassrls
  connection limit 60;

grant anon, authenticated to bb_api;   -- may assume them; does not inherit them

alter role bb_api set statement_timeout = '15s';
alter role bb_api set idle_in_transaction_session_timeout = '30s';
alter role bb_api set search_path = '';   -- forces every resolution to be explicit
```

`noinherit` is the load-bearing word. With it, a code path that forgets `set local role` runs with `bb_api`'s own privileges — which are none — and fails with `permission denied for function` immediately and loudly. With `inherit`, the same bug would run with `authenticated`'s privileges and succeed, which is the failure you would not notice. `bb_api` must also never own a table: `force row level security` (Stage 1) makes the owner obey its own policies, but owning nothing is simpler and removes the question.

The service role is not granted to `bb_api` and the service-role key is not in the API's configuration at all. See §18.

### Pooling: the decision this layer changes

`IMPROVEMENT_PLAN.md` §6 put the request path behind **Supavisor in transaction mode**, because the request path was serverless Next.js with no durable pool of its own. A long-lived .NET process changes that premise: Npgsql *is* the pool.

| Option | Verdict |
|---|---|
| Npgsql pool → Supavisor **transaction** mode | **Avoid.** Double pooling. Npgsql holds a logical connection that Supavisor may hand to a different backend between transactions; prepared-statement caching and `DISCARD ALL` behaviour both get surprising. |
| Npgsql pool → Supavisor **session** mode | Acceptable. One Supavisor connection per Npgsql connection, so Supavisor adds a hop and little else. Use if the direct endpoint is not reachable from the hosting region. |
| Npgsql pool → **direct** Postgres endpoint | **Recommended.** Npgsql does the multiplexing; `MaxPoolSize` is the real connection budget and is sized once, in one place. |

```csharp
// BabyBlue.Data/Npgsql/DataSourceFactory.cs
public static NpgsqlDataSource Create(string connectionString, ILoggerFactory loggerFactory)
{
    var b = new NpgsqlDataSourceBuilder(connectionString)
    {
        ConnectionStringBuilder =
        {
            // Pooling is the real capacity decision. Keep MaxPoolSize * instance count
            // below bb_api's connection limit, with headroom for migrations.
            Pooling                = true,
            MinPoolSize            = 5,
            MaxPoolSize            = 40,
            ConnectionIdleLifetime = 300,
            ConnectionPruningInterval = 10,
            Timeout                = 10,    // seconds to obtain a connection
            CommandTimeout         = 20,    // ceiling above the 15s statement_timeout
            NoResetOnClose         = false, // KEEP false — DISCARD ALL on return to pool
            IncludeErrorDetail     = false, // never let column values into exception text
            ApplicationName        = "babyblue-api",
            SslMode                = SslMode.VerifyFull,
        }
    };
    b.UseLoggerFactory(loggerFactory);
    b.EnableDynamicJson();                        // jsonb ↔ JsonDocument / JsonElement
    return b.Build();
}
```

`CommandTimeout` is deliberately above `statement_timeout`: the database should be the one to cancel, so the error carries a `PostgresException` with SQLSTATE `57014` rather than a client-side `OperationCanceledException` with no server context.

### Retries

Retry **only** on connection-establishment failures and SQLSTATE `40001` (serialisation failure) / `40P01` (deadlock), at most twice, with jitter, and **only for procedures the generator marks `stable`** (reads). A write retry is only safe if the procedure is idempotent, and most are not: retrying `patient_appointment_book` after an ambiguous failure can double-book — which the `no_double_booking` exclusion constraint would reject, producing a user-facing error on a booking that in fact succeeded. Reads retry; writes surface the error.

---

## 5. The procedure gateway

PostgreSQL's 106 objects are **functions**, not `PROCEDURE`s. Two consequences that determine the whole data-access shape:

> **Do not use `CommandType.StoredProcedure`.** Npgsql maps it to `CALL fn(...)`, which works only for real `CREATE PROCEDURE` objects. Every one of the 106 is `CREATE FUNCTION`, and the `returns table (...)` ones cannot be invoked with `CALL` at all. Use `CommandType.Text` with `select ... from <fn>(...)`.

> **Use named-argument notation.** `fn(p_practice => @practice, p_q => @q)` binds by parameter name, so adding an argument to a procedure with a default does not silently shift every positional binding. It also makes the generated call sites readable against `STORED_PROCEDURES.md`.

Three call shapes, matching the three return conventions in `STORED_PROCEDURES.md` §2:

| Procedure returns | SQL | Dapper |
|---|---|---|
| `table (...)` — lists and single rows | `select * from <fn>(...)` | `QueryAsync<TRow>` |
| `uuid` / `int` / `text` / `jsonb` / `bytea` | `select <fn>(...)` | `ExecuteScalarAsync<T>` |
| `void` — state changes | `select <fn>(...)` | `ExecuteAsync` |

```csharp
// BabyBlue.Data/ProcedureGateway.cs
public sealed class ProcedureGateway(NpgsqlDataSource dataSource, ICallerAccessor callerAccessor)
{
    public Task<IReadOnlyList<TRow>> QueryAsync<TRow>(
        ProcedureName proc, object? args, CancellationToken ct) =>
        RunAsync(proc, args, static async (cmd, c) =>
            (IReadOnlyList<TRow>)(await c.conn.QueryAsync<TRow>(cmd)).AsList(), Shape.Table, ct);

    public Task<T?> ScalarAsync<T>(
        ProcedureName proc, object? args, CancellationToken ct) =>
        RunAsync(proc, args, static (cmd, c) => c.conn.ExecuteScalarAsync<T>(cmd), Shape.Scalar, ct);

    public Task ExecuteAsync(
        ProcedureName proc, object? args, CancellationToken ct) =>
        RunAsync(proc, args, static (cmd, c) => c.conn.ExecuteAsync(cmd), Shape.Scalar, ct);

    private async Task<TResult> RunAsync<TResult>(
        ProcedureName proc, object? args,
        Func<CommandDefinition, (NpgsqlConnection conn, NpgsqlTransaction tx), Task<TResult>> run,
        Shape shape, CancellationToken ct)
    {
        var caller = callerAccessor.Current;   // request-scoped; throws if the pipeline skipped §3

        await using var conn = await dataSource.OpenConnectionAsync(ct);
        await using var tx   = await conn.BeginTransactionAsync(ct);

        await SessionContext.ApplyAsync(conn, tx, caller, ct);

        // proc.Sql is built by the GENERATOR from the catalogue: a constant string per
        // procedure, with named-argument notation. Nothing from the request reaches it.
        var sql = shape == Shape.Table ? $"select * from {proc.Sql}" : $"select {proc.Sql}";

        var result = await run(
            new CommandDefinition(sql, args, tx, cancellationToken: ct), (conn, tx));

        await tx.CommitAsync(ct);
        return result;
    }
}
```

Dapper configuration, once, at startup:

```csharp
Dapper.DefaultTypeMap.MatchNamesWithUnderscores = true;   // client_id → ClientId
SqlMapper.AddTypeHandler(new JsonbTypeHandler());          // jsonb → JsonElement
SqlMapper.AddTypeHandler(new TextArrayTypeHandler());      // text[] → string[]
```

### Why a generic `/rpc/{name}` endpoint is wrong

It is tempting, and it would be about forty lines. Reject it. A passthrough that takes a procedure name from the URL means every procedure granted to `authenticated` becomes callable with arbitrary arguments from anywhere, with no OpenAPI description, no per-endpoint rate limit, no per-endpoint cache policy, and no compile-time record of the surface. That is the unversioned, untestable query surface of `STORED_PROCEDURES.md` §1 reconstructed one layer up. **One route per procedure, generated.**

---

## 6. Generate the contract; do not type it

106 procedures × (a C# record for the result + a typed call method + a request DTO) is roughly 4,000 lines of mechanical code that must stay exactly in step with the database. Hand-writing it guarantees drift, and drift here is the specific failure D-26 removed from the TypeScript side.

`tools/BabyBlue.ContractGen` is a small console app, run against a freshly migrated database, that reads the catalogue and emits `BabyBlue.Data/Generated/*.g.cs`.

```sql
-- what the generator reads: every procedure, its arguments, and its result columns
select n.nspname                      as schema_name,
       p.proname                      as name,
       pg_get_function_arguments(p.oid)      as args,
       pg_get_function_identity_arguments(p.oid) as identity_args,
       pg_get_function_result(p.oid)         as result,
       p.provolatile                  as volatility,   -- 's' = stable → cacheable, retryable
       p.prosecdef                    as security_definer,
       -- the grant list, so the generator can assert §18 of STORED_PROCEDURES.md
       (select array_agg(g) from unnest(array['anon','authenticated']) g
         where has_function_privilege(g, p.oid, 'execute')) as granted_to
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = :schema
   and p.proname not like '\_%'            -- helpers are internal; never generated
 order by p.proname;
```

For each row it emits:

```csharp
// BabyBlue.Data/Generated/Contracts.g.cs  — from `returns table (...)`
public sealed record PracticeClientRow(
    Guid   ClientId,
    string FullName,
    string? Phone,
    string? Email,
    bool   ConsentRecordStorage,
    DateTimeOffset? ConsentAt,
    DateTimeOffset? LastVisit,
    DateTimeOffset? NextAppointment,
    int    Visits);

// BabyBlue.Data/Generated/Procedures.g.cs
public static class Procedures
{
    public static readonly ProcedureName PracticeClientsList = new(
        "practice_clients_list",
        "practice_clients_list(p_practice => @Practice, p_q => @Q, "
      + "p_limit => @Limit, p_offset => @Offset)",
        Volatility.Stable,
        GrantedTo.Authenticated);
}

public sealed class PracticeClientsProcedures(ProcedureGateway gw)
{
    public Task<IReadOnlyList<PracticeClientRow>> ListAsync(
        Guid practice, string? q, int limit, int offset, CancellationToken ct) =>
        gw.QueryAsync<PracticeClientRow>(Procedures.PracticeClientsList,
            new { Practice = practice, Q = q, Limit = limit, Offset = offset }, ct);
}
```

### Type mapping

| PostgreSQL | C# | Note |
|---|---|---|
| `uuid` | `Guid` | nullable where the column is |
| `text` | `string` / `string?` | |
| `int`, `smallint` | `int`, `short` | |
| `bigint` | `long` | `platform_audit_log.id` |
| `boolean` | `bool` | |
| `timestamptz` | `DateTimeOffset` | **never `DateTime`** — see below |
| `date` | `DateOnly` | `p_from`, `p_to` on `public_slots_list` |
| `text[]` | `string[]` | `practitioners.languages` after 4NF |
| `jsonb` | `JsonElement` | the two dashboard documents + `evidence`, `meta` |
| `bytea` | `byte[]` | `growth_asset_download` only — §15 |
| `public.practice_role` | `string` with a `[AllowedValues]` attribute | enum is sent as text; PostgreSQL casts |
| `public.consent_purpose` | `string` with `[AllowedValues]` | same |
| `timerange` | not exposed | `availability_rules.during` is generated and unwritable (`DATABASE_SCHEMA_4NF.md` §9); procedures expose `start_time`/`end_time` as `text` |

**`DateTimeOffset`, not `DateTime`.** A practice in `Africa/Lagos` is the test case `STORED_PROCEDURES.md` §21 calls out: leave windows are currently built with a hard-coded `+02:00`. `DateTime` silently drops or reinterprets the offset depending on `DateTimeKind`, which is the same class of bug one layer up. Npgsql maps `timestamptz` to `DateTimeOffset` cleanly; keep it that way and let the procedures do timezone arithmetic with the practice's `timezone` column.

### Two assertions the generator must make, failing the build

1. **Every non-helper function in the brand schema has a generated method.** A procedure added to the database without a route is invisible; one removed while a route survives is a 500. The generated file is committed, so `git diff --exit-code` after regeneration is the CI gate.
2. **No function is executable by `PUBLIC`.** Stage 1 of `IMPLEMENTATION_PLAN.md` makes this true; the generator sees `has_function_privilege('public', oid, 'execute')` and should refuse to emit if any function fails it. This is the same assertion the Stage 1 exit criterion names, enforced a second time where the developer will notice.

---

## 7. Request pipeline

Order matters; this is the order.

```csharp
// Program.cs — abbreviated to the ordering that matters
var app = builder.Build();

app.UseMiddleware<CorrelationIdMiddleware>();   // X-Request-Id in, out, and on every log line
app.UseExceptionHandler();                      // ProblemDetailsExceptionHandler — §10
app.UseSecurityHeaders();                       // §19
app.UseCors("brand-domains");                   // origins from tenant_brand_domains — §19
app.UseMiddleware<BrandResolutionMiddleware>(); // Host → brand; unknown host ⇒ 404. BEFORE auth:
                                                // an unknown host must 404 even with a valid token.
app.UseAuthentication();                        // Supabase JWT → ClaimsPrincipal — §11
app.UseMiddleware<CallerContextMiddleware>();   // (uid, DbRole, claimsJson, brand) → request scope
app.UseRateLimiter();                           // needs uid AND brand, so it comes after both — §12
app.UseOutputCache();                           // public reads only; bypassed when authenticated — §13
app.MapControllers();
```

Two placements are load-bearing:

- **Brand before auth.** A valid token for brand A arriving at an unresolvable host must not be served. Resolving first means the 404 is unconditional.
- **Rate limiting after caller context.** The per-user limits in `IMPROVEMENT_PLAN.md` §10 cannot be applied before the uid is known, and the per-practice limits need the brand.

---

## 8. Endpoint map

Conventions: all routes under `/v1`. Path segments are resources; procedure arguments that identify a resource become path parameters, the rest become query parameters (reads) or a JSON body (writes). `{p}` is `practice_id`. Every route calls exactly one procedure.

### Public — `anon` + `authenticated` (10)

No route here may return a name, phone number or any other personal field (D-07).

| Verb | Route | Procedure | Cache |
|---|---|---|---|
| GET | `/v1/directory/practitioners` | `public_practitioner_search` | 60s SWR |
| GET | `/v1/directory/practitioners/{id}` | `public_practitioner_get` | 5 min |
| GET | `/v1/directory/practitioners/{id}/services` | `public_practitioner_services` | 5 min |
| GET | `/v1/directory/practitioners/{id}/slots` | `public_slots_list` | **never** |
| GET | `/v1/directory/cities` | `public_city_list` | 1 h |
| GET | `/v1/directory/specialities` | `public_speciality_list` | 1 h |
| GET | `/v1/queue/{slug}` | `public_queue_info` | 10s |
| POST | `/v1/queue/{slug}/join` | `public_queue_join` | — |
| GET | `/v1/queue/tokens/{token}` | `public_queue_status` | **never** |
| DELETE | `/v1/queue/tokens/{token}` | `public_queue_leave` | — |

The queue token goes in the path, not a query string, and the route must be excluded from access logging (§16): it is a bearer credential (96 bits, D-07).

### Patient — `authenticated` (13)

| Verb | Route | Procedure |
|---|---|---|
| GET | `/v1/me/profile` | `patient_profile_get` |
| PATCH | `/v1/me/profile` | `patient_profile_update` |
| GET | `/v1/me/appointments` | `patient_appointments_list` |
| GET | `/v1/me/appointments/{id}` | `patient_appointment_get` |
| POST | `/v1/me/holds` | `patient_slot_hold` |
| GET | `/v1/me/holds/{id}` | `patient_hold_get` |
| DELETE | `/v1/me/holds/{id}` | `patient_hold_release` |
| POST | `/v1/me/appointments` | `patient_appointment_book` |
| POST | `/v1/me/appointments/{id}/cancel` | `patient_appointment_cancel` |
| POST | `/v1/me/appointments/{id}/reschedule` | `patient_appointment_reschedule` |
| POST | `/v1/me/appointments/{id}/check-in` | `patient_appointment_check_in` |
| GET | `/v1/me/export` | `patient_account_export` |
| DELETE | `/v1/me` | `patient_account_delete` |

`POST /v1/me/appointments` takes `{ "hold_id": "..." }` — booking is a hold conversion, not a resource creation from scratch, and the body makes that explicit. `DELETE /v1/me` is the POPIA s14 route and its copy changes in the same release as Stage 8B (D-29); the endpoint must return `has_records` as a `409`, not a generic failure, so the client can say something true.

### Practice — context, dashboard, calendar (11)

| Verb | Route | Procedure |
|---|---|---|
| GET | `/v1/practices` | `practice_memberships_list` |
| GET | `/v1/me/platform-role` | `platform_my_role` |
| GET | `/v1/practices/{p}/dashboard` | `practice_dashboard_get` |
| GET | `/v1/practices/{p}/insights` | `practice_insights_get` |
| GET | `/v1/practices/{p}/setup-progress` | `practice_setup_progress` |
| GET | `/v1/practices/{p}/calendar/appointments` | `practice_calendar_appointments` |
| GET | `/v1/practices/{p}/calendar/availability` | `practice_calendar_availability` |
| GET | `/v1/practices/{p}/calendar/time-off` | `practice_calendar_timeoff` |
| GET | `/v1/practices/{p}/queue/preview` | `practice_queue_preview` |
| GET | `/v1/practices/{p}/queue/waiting-count` | `practice_queue_waiting_count` |
| GET | `/v1/practices/{p}/bookings/recent` | `practice_recent_app_bookings` |

### Practice — team and practitioners (12)

| Verb | Route | Procedure |
|---|---|---|
| GET | `/v1/practices/{p}/practitioners` | `practice_practitioners_list` |
| POST | `/v1/practices/{p}/practitioners` | `practice_practitioner_create` |
| PATCH | `/v1/practices/{p}/practitioners/{id}` | `practice_practitioner_update` |
| GET | `/v1/practices/{p}/practitioners/{id}/services` | `practice_practitioner_services_list` |
| PUT | `/v1/practices/{p}/practitioners/{id}/services` | `practice_practitioner_services_set` |
| GET | `/v1/practices/{p}/practitioners/{id}/registrations` | `practice_registrations_list` |
| POST | `/v1/practices/{p}/practitioners/{id}/registrations` | `practice_registration_submit` |
| GET | `/v1/practices/{p}/practitioners/{id}/verifications` | `practice_verifications_list` |
| GET | `/v1/practices/{p}/members` | `practice_team_list` |
| POST | `/v1/practices/{p}/members` | `practice_member_add` |
| PUT | `/v1/practices/{p}/members/{userId}/role` | `practice_member_role_set` |
| DELETE | `/v1/practices/{p}/members/{userId}` | `practice_member_remove` |

`PUT .../role` is the route that fixes the Stage 0 bug: `src/app/practice/team/page.tsx:318` currently issues a direct `update practice_members set role` that bypasses the last-owner guard. Behind this endpoint the guard is `practice_member_role_set`'s `sole_owner` check and is unbypassable. The API must map `sole_owner` to `409`.

### Practice — services (5)

| Verb | Route | Procedure |
|---|---|---|
| GET | `/v1/practices/{p}/services` | `practice_services_list` |
| PUT | `/v1/practices/{p}/services` | `practice_service_upsert` |
| GET | `/v1/practices/{p}/services/{id}/practitioners` | `practice_service_practitioners_list` |
| PUT | `/v1/practices/{p}/services/{id}/practitioners` | `practice_service_practitioners_set` |
| POST | `/v1/practices/{p}/services/{id}/deactivate` | `practice_service_deactivate` |

`PUT /services` is an upsert with an optional `service_id` in the body, matching the procedure's collapse of the paired insert/update (§4 of `STORED_PROCEDURES.md`). Deactivation is a POST to a sub-resource rather than `DELETE`, because it is a state change that can be refused (`service_in_use` when future appointments exist) and `DELETE` would imply otherwise.

### Practice — availability and leave (6)

| Verb | Route | Procedure |
|---|---|---|
| GET | `/v1/practices/{p}/practitioners/{id}/availability` | `practice_availability_list` |
| PUT | `/v1/practices/{p}/practitioners/{id}/availability` | `practice_availability_set` |
| POST | `/v1/practices/{p}/practitioners/{id}/availability/pattern` | `practice_availability_apply_pattern` |
| GET | `/v1/practices/{p}/time-off` | `practice_timeoff_list` |
| POST | `/v1/practices/{p}/time-off` | `practice_timeoff_add` |
| DELETE | `/v1/practices/{p}/time-off/{id}` | `practice_timeoff_remove` |

### Practice — clients and consent (9)

| Verb | Route | Procedure |
|---|---|---|
| GET | `/v1/practices/{p}/clients` | `practice_clients_list` |
| GET | `/v1/practices/{p}/clients/search` | `practice_client_search` |
| GET | `/v1/practices/{p}/clients/{id}` | `practice_client_get` |
| POST | `/v1/practices/{p}/clients` | `practice_client_create` |
| PATCH | `/v1/practices/{p}/clients/{id}` | `practice_client_update` |
| PUT | `/v1/practices/{p}/clients/{id}/notes` | `practice_client_notes_set` |
| GET | `/v1/practices/{p}/clients/{id}/consents` | `practice_client_consents_list` |
| POST | `/v1/practices/{p}/clients/{id}/consents` | `practice_client_consent_grant` |
| DELETE | `/v1/practices/{p}/clients/{id}/consents/{purpose}` | `practice_client_consent_withdraw` |

The consent pair is deliberately two endpoints, not one toggle. `DATABASE_SCHEMA_4NF.md` §10 makes consent an append-only event series precisely because the current boolean destroys the evidence POPIA s11(3) requires; an API that offered `PUT /consents { granted: bool }` would re-create the toggle at the HTTP layer and invite a client to treat it as overwritable state. `DELETE` appends a withdrawal; the grant remains readable through `GET /consents`.

`/clients/search` is a separate route from `/clients` because it is a different procedure with a different ceiling (`p_limit default 6`, for typeahead) and should carry its own rate limit.

### Practice — queue, Flow (5)

| Verb | Route | Procedure |
|---|---|---|
| GET | `/v1/practices/{p}/queue` | `practice_queue_list` |
| POST | `/v1/practices/{p}/queue/walk-ins` | `practice_queue_walkin_add` |
| PUT | `/v1/practices/{p}/queue/{id}/status` | `practice_queue_status_set` |
| POST | `/v1/practices/{p}/queue/call-next` | `practice_queue_call_next` |
| PUT | `/v1/practices/{p}/queue/{id}/client` | `practice_queue_link_client` |

`call-next` is a POST with no body and is **not idempotent** — `STORED_PROCEDURES.md` §21 requires that two concurrent calls return different entries. The API must not retry it (§4) and must not cache it.

### Practice — appointments (7)

| Verb | Route | Procedure |
|---|---|---|
| GET | `/v1/practices/{p}/appointments/{id}` | `practice_appointment_get` |
| GET | `/v1/practices/{p}/appointments/{id}/history` | `practice_appointment_history` |
| POST | `/v1/practices/{p}/appointments` | `practice_appointment_create` |
| PUT | `/v1/practices/{p}/appointments/{id}/status` | `practice_appointment_status_set` |
| POST | `/v1/practices/{p}/appointments/{id}/cancel` | `practice_appointment_cancel` |
| POST | `/v1/practices/{p}/appointments/{id}/reschedule` | `practice_appointment_reschedule` |
| GET | `/v1/practices/{p}/appointments/slots` | `practice_appointment_slots` |

### Practice — settings, locations, onboarding (7)

| Verb | Route | Procedure |
|---|---|---|
| POST | `/v1/practices` | `practice_create` |
| POST | `/v1/practices/onboard` | `practice_onboard` |
| GET | `/v1/practices/{p}/settings` | `practice_settings_get` |
| PATCH | `/v1/practices/{p}/settings` | `practice_settings_update` |
| GET | `/v1/practices/{p}/locations` | `practice_locations_list` |
| PUT | `/v1/practices/{p}/locations` | `practice_location_upsert` |
| DELETE | `/v1/practices/{p}/locations/{id}` | `practice_location_remove` |

### Growth (16)

| Verb | Route | Procedure |
|---|---|---|
| GET | `/v1/growth/services` | `growth_services_list` |
| GET | `/v1/practices/{p}/growth/requests` | `growth_requests_list` |
| POST | `/v1/practices/{p}/growth/requests` | `growth_request_create` |
| GET | `/v1/growth/requests/{id}` | `growth_request_get` |
| PUT | `/v1/growth/requests/{id}/status` | `growth_request_status_set` |
| GET | `/v1/growth/requests/{id}/updates` | `growth_updates_list` |
| POST | `/v1/growth/requests/{id}/updates` | `growth_update_post` |
| GET | `/v1/growth/requests/{id}/approvals` | `growth_approvals_list` |
| POST | `/v1/growth/requests/{id}/approvals` | `growth_approval_add` |
| POST | `/v1/growth/requests/{id}/approvals/{aid}/decide` | `growth_approval_decide` |
| GET | `/v1/growth/requests/{id}/assets` | `growth_assets_list` |
| POST | `/v1/growth/requests/{id}/assets` | `growth_asset_add` |
| GET | `/v1/growth/assets/{id}/content` | `growth_asset_download` |
| GET | `/v1/growth/requests/{id}/reports` | `growth_reports_list` |
| POST | `/v1/growth/requests/{id}/reports` | `growth_report_create` |
| GET | `/v1/growth/inbox` | `growth_inbox` |

Growth request routes are **not** nested under `/practices/{p}` except for the two that take `p_practice`, because `_require_request_access` resolves the practice from the request and authorises an operator who is not a member of it. Nesting them under a practice would invite the API to pass a practice id the procedure does not want and cannot trust.

### Platform admin (5)

| Verb | Route | Procedure |
|---|---|---|
| GET | `/v1/platform/overview` | `platform_overview` |
| GET | `/v1/platform/audit-log` | `platform_audit_log` |
| POST | `/v1/platform/roles` | `platform_role_grant` |
| PUT | `/v1/platform/practices/{id}/status` | `platform_practice_status_set` |
| PUT | `/v1/platform/practitioners/{id}/verification` | `platform_verification_set` |

These are granted to `authenticated` like everything else, and `is_platform_admin()` inside each procedure is the only gate (`STORED_PROCEDURES.md` §18). **Do not add a C# `[Authorize(Roles = "platform_admin")]` on top.** A second authority that can disagree with the first is worse than one authority, and the claim would have to come from somewhere the API trusts more than the database — which nothing is.

`GET /v1/platform/audit-log` takes `before` (a `timestamptz`) and `limit`, keyset not offset, per `IMPROVEMENT_PLAN.md` §7.

---

## 9. Controllers

A controller action is a parameter bind, one procedure call, and a result. If an action is longer than this, the logic belongs in a procedure.

```csharp
// Controllers/PracticeClientsController.cs
[ApiController]
[Route("v1/practices/{practice:guid}/clients")]
[Authorize]                                   // requires a token; the DB decides the rest
[EnableRateLimiting(Policies.AuthenticatedPerUser)]
public sealed class PracticeClientsController(PracticeClientsProcedures clients) : ControllerBase
{
    /// <summary>Clients of a practice. Bounded; the procedure clamps p_limit.</summary>
    [HttpGet]
    [ProducesResponseType<IReadOnlyList<PracticeClientRow>>(StatusCodes.Status200OK)]
    public async Task<IReadOnlyList<PracticeClientRow>> List(
        Guid practice,
        [FromQuery, StringLength(120)] string? q,
        [FromQuery, Range(1, 100)] int limit = 50,
        [FromQuery, Range(0, 100_000)] int offset = 0,
        CancellationToken ct = default)
        => await clients.ListAsync(practice, q, limit, offset, ct);

    [HttpPost("{client:guid}/consents")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public async Task<IActionResult> GrantConsent(
        Guid practice, Guid client, [FromBody] GrantConsentRequest body, CancellationToken ct)
    {
        await clients.ConsentGrantAsync(practice, client, body.Purpose, body.Evidence, ct);
        return NoContent();
    }
}

// BabyBlue.Contracts — shape validation only, never meaning
public sealed record GrantConsentRequest(
    [property: Required, AllowedValues("record_storage", "appointment_reminders", "marketing")]
    string Purpose,
    JsonElement? Evidence);
```

Note what is absent: no check that the caller is a member of `practice`, no check that `client` belongs to `practice`, no check that the purpose is one the practice has configured. All three are the procedure's job, and `_require_member` / `_require_role` make them impossible to omit there (`STORED_PROCEDURES.md` §3). `[Range]` on `limit` is not a duplicate of the procedure's `least(greatest(...))` clamp — it rejects an absurd value at the edge with a 400 instead of silently clamping, which is better feedback — but the clamp remains the authority.

### Status codes

| Situation | Code |
|---|---|
| Read returning rows, or zero rows | `200` with `[]` — never `404` for an empty list |
| Read of a single resource the procedure returns no row for | `404` |
| Create returning a `uuid` | `201` with `Location` and `{ "id": "..." }` |
| `void` state change | `204` |
| Shape invalid | `400` |
| No or invalid token | `401` |
| `forbidden` from the procedure | `403` |
| `not_found` from the procedure | `404` |
| A refused but valid state change (`sole_owner`, `slot_unavailable`, `service_in_use`, `has_records`) | `409` |
| Rate limit | `429` with `Retry-After` |
| `statement_timeout` (`57014`) | `504` |

---

## 10. Error model

The procedures raise a fixed vocabulary of codes (`STORED_PROCEDURES.md` §2) and `src/local/db.ts`'s `MESSAGES` map holds the user-facing prose. **Keep that split.** The API returns the machine code; the Next.js layer renders the copy. Moving the prose into C# would fork the user-facing contract across two languages and two deployments, and `MESSAGES` is explicitly named as the contract.

```csharp
// Middleware/ProblemDetailsExceptionHandler.cs
internal sealed class ProblemDetailsExceptionHandler(ILogger<ProblemDetailsExceptionHandler> log)
    : IExceptionHandler
{
    // The procedure vocabulary → HTTP. Anything absent here is a 500: an unmapped code
    // is a missing entry in this table AND in MESSAGES, and must be loud.
    private static readonly FrozenDictionary<string, int> Codes = new Dictionary<string, int>
    {
        ["not_authenticated"]      = 401,
        ["forbidden"]              = 403,
        ["not_found"]              = 404,
        ["not_editable"]           = 403,
        ["slot_unavailable"]       = 409,
        ["hold_expired"]           = 409,
        ["too_late_to_cancel"]     = 409,
        ["not_cancellable"]        = 409,
        ["not_reschedulable"]      = 409,
        ["too_early_to_check_in"]  = 409,
        ["not_checkin_able"]       = 409,
        ["invalid_transition"]     = 409,
        ["user_not_found"]         = 409,
        ["sole_owner"]             = 409,
        ["has_records"]            = 409,
        ["registration_in_use"]    = 409,
        ["last_practitioner"]      = 409,
        ["service_in_use"]         = 409,
        ["overlapping_availability"] = 409,
        ["queue_closed"]           = 409,
        ["consent_required"]       = 409,
        ["too_many_holds"]         = 429,
        ["invalid_registration"]   = 400,
        ["invalid_name"]           = 400,
        ["invalid_range"]          = 400,
        ["price_required"]         = 400,
        ["metric_unknown"]         = 400,
        ["asset_too_large"]        = 413,
    }.ToFrozenDictionary();

    public async ValueTask<bool> TryHandleAsync(
        HttpContext ctx, Exception ex, CancellationToken ct)
    {
        var (status, code) = ex switch
        {
            PostgresException pg => Classify(pg),
            OperationCanceledException when ctx.RequestAborted.IsCancellationRequested => (499, "client_closed"),
            _ => (500, "internal_error")
        };

        // Codes only. MessageText is a controlled vocabulary; Detail, Hint and the
        // statement text are NOT, and may quote column values — so they are never returned
        // and never logged. IncludeErrorDetail=false (§4) is the second line here.
        log.LogWarning("procedure_failed proc={Proc} code={Code} sqlstate={SqlState} status={Status}",
            ctx.Items["procedure"], code, (ex as PostgresException)?.SqlState, status);

        await Results.Problem(
            type:   $"https://babyblue.co.za/errors/{code}",
            title:  code,
            statusCode: status,
            extensions: new Dictionary<string, object?>
            {
                ["code"] = code,                                   // the client's switch key
                ["request_id"] = ctx.TraceIdentifier,
            }).ExecuteAsync(ctx);
        return true;
    }

    private static (int, string) Classify(PostgresException pg)
    {
        var text = pg.MessageText;
        if (Codes.TryGetValue(text, out var mapped)) return (mapped, text);

        return pg.SqlState switch
        {
            "23P01" when pg.ConstraintName == "no_double_booking" => (409, "slot_unavailable"),
            "23505" or "23P01" => (409, "conflict"),
            "23503"            => (409, "conflict"),
            "42501"            => (403, "forbidden"),   // incl. RLS and missing EXECUTE grant
            "28000"            => (401, "not_authenticated"),
            "P0002"            => (404, "not_found"),
            "57014"            => (504, "statement_timeout"),
            "54000"            => (429, "too_many_holds"),
            "53300"            => (503, "too_many_connections"),
            _                  => (500, "internal_error"),
        };
    }
}
```

Three notes:

- **`42501` maps to `403`, and that covers two very different causes**: an RLS policy refusing a row, and `bb_api` calling a function it has no `EXECUTE` grant on. The second is a deployment bug, not a user error, and will look like a permissions problem to the user. The log line carries the procedure name, which is how you tell them apart; alert on a `42501` rate above baseline (§16).
- **`23P01` on `no_double_booking` becomes `slot_unavailable`**, matching the existing `MESSAGES` fallback in `src/local/db.ts`. The constraint is D-05 and the client already has copy for it.
- **A new procedure error code requires three edits in one commit**: the procedure, `MESSAGES` in `src/local/db.ts`, and `Codes` above. The integration test in §20 asserts that the three sets are equal, so forgetting one fails CI rather than returning a raw SQLSTATE to a patient.

---

## 11. Authentication

Supabase issues the tokens; the API validates them and never mints them. Supabase Auth stays exactly as `IMPLEMENTATION_PLAN.md` Stage 6 and `STORED_PROCEDURES.md` §17 describe — the API is not an identity provider and has no sign-in, sign-up or password endpoint.

```csharp
builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(o =>
    {
        // Asymmetric (ES256/RS256) with JWKS — preferred. The API then holds no shared secret,
        // and Supabase key rotation needs no deployment here.
        o.Authority = $"{supabaseUrl}/auth/v1";
        o.MetadataAddress = $"{supabaseUrl}/auth/v1/.well-known/openid-configuration";
        o.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer   = true,  ValidIssuer   = $"{supabaseUrl}/auth/v1",
            ValidateAudience = true,  ValidAudience = "authenticated",
            ValidateLifetime = true,  ClockSkew     = TimeSpan.FromSeconds(30),
            ValidateIssuerSigningKey = true,
            NameClaimType = "sub",
        };
        o.MapInboundClaims = false;    // keep `sub` as `sub`, not ClaimTypes.NameIdentifier
    });
```

| Rule | |
|---|---|
| Token source | `Authorization: Bearer`. Never a cookie — the API is cross-origin from the Next.js host, and a cookie would need CSRF defences this design does not otherwise require. |
| Algorithm | ES256/RS256 with JWKS. If the project is still on legacy HS256, the shared secret is a `JWT_SECRET` in the secret store and rotation becomes a deployment — record it as debt. |
| `aud` | Must be `authenticated`. Reject anything else. |
| `role` claim | **Read for logging only.** It never becomes the database role (§3 detail 4). |
| Anonymous routes | `[AllowAnonymous]` on the 10 public endpoints; a token present on them is still validated, and `DbRole` becomes `Authenticated`, which is correct — a signed-in patient browsing the directory is `authenticated`. |
| Expiry | No refresh logic in the API. A `401` with `code: "token_expired"` tells the client to refresh through Supabase and retry. |
| Clock | `ClockSkew` 30s, not the 5-minute default: a 5-minute window on a short-lived access token is most of its life. |

The PBKDF2 shim in `src/local/auth.ts` is deleted at Stage 6 as already planned; it must not be reimplemented in C#.

---

## 12. Rate limiting

This is the capability the layer exists to provide. `IMPROVEMENT_PLAN.md` §10 splits the limits between the edge (IP-keyed, Vercel WAF) and the request handler (JWT-keyed). The second column is this API's.

```csharp
builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    o.OnRejected = async (ctx, ct) =>
    {
        ctx.HttpContext.Response.Headers.RetryAfter =
            ctx.Lease.TryGetMetadata(MetadataName.RetryAfter, out var after)
                ? ((int)after.TotalSeconds).ToString() : "60";
        await Results.Problem(title: "rate_limited", statusCode: 429,
            extensions: new Dictionary<string, object?> { ["code"] = "rate_limited" })
            .ExecuteAsync(ctx.HttpContext);
    };

    // default for every authenticated route
    o.AddPolicy(Policies.AuthenticatedPerUser, ctx => RateLimitPartition.GetTokenBucketLimiter(
        PartitionKey(ctx), _ => new TokenBucketRateLimiterOptions
        {
            TokenLimit = 120, TokensPerPeriod = 120,
            ReplenishmentPeriod = TimeSpan.FromMinutes(1), QueueLimit = 0
        }));

    // IMPROVEMENT_PLAN §10: 10 holds / hour / user, mirroring the database trigger
    o.AddPolicy(Policies.SlotHold, ctx => RateLimitPartition.GetFixedWindowLimiter(
        PartitionKey(ctx), _ => new FixedWindowRateLimiterOptions
        { PermitLimit = 10, Window = TimeSpan.FromHours(1), QueueLimit = 0 }));

    o.AddPolicy(Policies.PracticeCreate, ctx => RateLimitPartition.GetFixedWindowLimiter(
        PartitionKey(ctx), _ => new FixedWindowRateLimiterOptions
        { PermitLimit = 3, Window = TimeSpan.FromDays(1), QueueLimit = 0 }));

    o.AddPolicy(Policies.QueueJoin, ctx => RateLimitPartition.GetFixedWindowLimiter(
        $"{BrandOf(ctx)}:{ClientIpOf(ctx)}", _ => new FixedWindowRateLimiterOptions
        { PermitLimit = 3, Window = TimeSpan.FromHours(1), QueueLimit = 0 }));

    o.AddPolicy(Policies.DirectorySearch, ctx => RateLimitPartition.GetFixedWindowLimiter(
        $"{BrandOf(ctx)}:{ClientIpOf(ctx)}", _ => new FixedWindowRateLimiterOptions
        { PermitLimit = 60, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
});

// Partition on the uid where there is one, on brand+IP where there is not.
// The brand is always part of the key: one brand must not be able to exhaust another's budget.
static string PartitionKey(HttpContext ctx) =>
    ctx.User.FindFirst("sub")?.Value is { } sub
        ? $"{BrandOf(ctx)}:u:{sub}"
        : $"{BrandOf(ctx)}:ip:{ClientIpOf(ctx)}";
```

| Policy | Route | Limit | Source |
|---|---|---|---|
| `SlotHold` | `POST /v1/me/holds` | 10 / h / user | `IMPROVEMENT_PLAN.md` §10 |
| `PracticeCreate` | `POST /v1/practices` | 3 / day / user | §10 |
| `QueueJoin` | `POST /v1/queue/{slug}/join` | 3 / h / IP | §10 |
| `DirectorySearch` | `GET /v1/directory/practitioners` | 60 / min / IP | §10 |
| `AuthenticatedPerUser` | everything else authenticated | 120 / min / user | new, a backstop |
| `PublicPerIp` | everything else anonymous | 300 / min / IP | new, a backstop |

Two things to be honest about:

1. **The in-process limiter resets on deploy and is per-instance** — the same weakness `IMPROVEMENT_PLAN.md` §10 criticises in `/api/leads`. It is acceptable at one or two instances and must become a distributed limiter (Redis, via the Upstash Marketplace integration) before horizontal scaling. Record it as debt now.
2. **It does not replace the database trigger.** The `slot_holds_quota()` trigger in `IMPROVEMENT_PLAN.md` §10 stays, because it cannot be bypassed. The API limit is a cheaper, earlier rejection of the same abuse; the trigger is the guarantee. Where they disagree, the trigger wins and the API returns its `54000` as a `429`.

---

## 13. Caching

Only the public, non-personal reads, with exactly the TTLs in `IMPROVEMENT_PLAN.md` §6. Output caching, keyed on brand.

```csharp
builder.Services.AddOutputCache(o =>
{
    o.AddBasePolicy(b => b.NoCache());                       // default is no caching

    o.AddPolicy(CachePolicies.Facets, b => b
        .Expire(TimeSpan.FromHours(1))
        .SetVaryByHost(true)                                 // brand is in the Host
        .With(c => c.HttpContext.User.Identity?.IsAuthenticated != true));

    o.AddPolicy(CachePolicies.Listing, b => b
        .Expire(TimeSpan.FromSeconds(60))
        .SetVaryByQuery("q", "speciality", "city", "verified_only", "limit", "offset")
        .SetVaryByHost(true)
        .With(c => c.HttpContext.User.Identity?.IsAuthenticated != true));

    o.AddPolicy(CachePolicies.Profile, b => b
        .Expire(TimeSpan.FromMinutes(5)).SetVaryByHost(true)
        .With(c => c.HttpContext.User.Identity?.IsAuthenticated != true));
});
```

| Route | TTL | Invalidate |
|---|---|---|
| `/v1/directory/cities`, `/v1/directory/specialities` | 1 h | tag eviction on a listing change |
| `/v1/directory/practitioners` | 60 s, `stale-while-revalidate` | — |
| `/v1/directory/practitioners/{id}`, `.../services` | 5 min | tag eviction on profile or verification change |
| `/v1/directory/practitioners/{id}/slots` | **never** | — |
| everything authenticated | **never** | — |

The `With(...)` predicate excluding authenticated requests is not belt-and-braces; it is the thing that stops a signed-in response being stored under an anonymous cache key. A single mistake here is a cross-user data leak, which makes it the one place in this document where a redundant check is worth the clutter: the predicate on the policy, plus a response-header assertion in the integration tests (§20) that no `200` carrying an `Authorization` request header is ever marked cacheable.

**Slots are never cached.** `IMPROVEMENT_PLAN.md` §6: a patient shown a stale slot gets `slot_unavailable` at hold time, which is correct but is the worst moment in the product to be wrong.

---

## 14. Multitenancy

`MULTITENANCY_PLAN.md` §5's `withBrand()` moves into this API. It is the same algorithm with the same three non-negotiable rules.

```csharp
// Middleware/BrandResolutionMiddleware.cs
internal sealed class BrandResolutionMiddleware(
    RequestDelegate next, IBrandRegistry registry, ILogger<BrandResolutionMiddleware> log)
{
    public async Task InvokeAsync(HttpContext ctx)
    {
        var host = ctx.Request.Host.Host.ToLowerInvariant();
        var brand = await registry.ResolveAsync(host, ctx.RequestAborted);

        if (brand is null)
        {
            // Rule 2: unknown host is 404, NEVER a fallback to the default brand.
            // A misconfigured DNS entry must not serve BabyBlue's directory under a client's domain.
            log.LogWarning("brand_unresolved host={Host}", host);
            ctx.Response.StatusCode = StatusCodes.Status404NotFound;
            return;
        }
        if (brand.Status == "suspended" || brand.Status == "archived")
        {
            ctx.Response.StatusCode = StatusCodes.Status403Forbidden;
            return;
        }

        ctx.Items[BrandKeys.Resolved] = brand;
        await next(ctx);
    }
}
```

`IBrandRegistry` calls `public.resolve_brand(@host)` — which returns only presentational fields, so `contract_ref`, `tier` and `data_region` never leave the database — and caches the result for 5 minutes in `IMemoryCache` with a negative cache of 30 seconds for unknown hosts (so an unknown-host flood is not 1,000 round trips). `tenant_brands` itself is unreadable by `bb_api` through its assumed roles, which is correct: one brand must not be able to enumerate the others.

| Rule from `MULTITENANCY_PLAN.md` §5 | Where it lives here |
|---|---|
| 1. `set local`, never `set` | `SessionContext.ApplyAsync`, §3 |
| 2. Unknown host is 404 | the middleware above |
| 3. Schema name is never user input | `resolve_brand` is the only source; the `^bb_[a-z][a-z0-9_]{1,28}$` regex in §3 is the second check |

**`resolve_brand` is the one procedure called outside the brand context**, because routing must resolve before a schema is chosen. It lives in `public`, is `security definer`, and is granted to `anon` — so the registry lookup runs with `set local role anon` and no `search_path` override. It is the only exception in the system and should be the only method on `IBrandRegistry`.

Feature flags (`MULTITENANCY_PLAN.md` §8) come back on the brand row. An endpoint belonging to a disabled module returns `404`, not `403`: a brand without Growth should not learn that Growth exists.

---

## 15. Binary, JSON and array edges

| Case | Handling |
|---|---|
| `growth_asset_add(..., p_content bytea)` | `5 MiB` ceiling enforced in the procedure (`asset_too_large`). Set `MaxRequestBodySize` to `6_291_456` on this action only via `[RequestSizeLimit]`, and reject earlier on `Content-Length`. Accept `multipart/form-data`, stream to a pooled buffer, pass `byte[]`. Do not buffer the whole request for any other route. |
| `growth_asset_download(p_asset) returns bytea` | `FileContentResult` with the `mime` and `file_name` from `growth_assets_list`, `Content-Disposition: attachment`, and `X-Content-Type-Options: nosniff`. Never `inline` — these are third-party uploads and an inline HTML or SVG asset is stored XSS on the API's origin. |
| `practice_dashboard_get`, `practice_insights_get` → `jsonb` | Returned as the response body verbatim. `JsonElement` straight through; do not deserialise into a C# model. `STORED_PROCEDURES.md` §2 keeps these two as `jsonb` because their shape is genuinely a dashboard document, and a C# record would freeze a shape the database is allowed to evolve. |
| `patient_account_export() → jsonb` | Verbatim, `Content-Disposition: attachment; filename="babyblue-export.json"`. This is the POPIA s23 access route; it must not be cached, logged or truncated. |
| `text[]` (`languages`, `p_service_ids`, `p_roles`) | Npgsql maps `string[]`/`Guid[]` natively. Pass arrays as arrays; never build a comma-joined string. |
| `evidence jsonb`, `meta jsonb` on writes | `JsonElement?` in the request DTO, forwarded as `jsonb`. Validate size (≤ 8 KiB) and depth at the edge; the API does not interpret the contents. |
| `timerange` | Not exposed. `availability_rules.during` is generated and cannot be written (`DATABASE_SCHEMA_4NF.md` §9); the procedures take `start_time`/`end_time` as `text` and the API passes them through unparsed. |
| Enums (`practice_role`, `consent_purpose`, `marketing_status`) | `string` with `[AllowedValues]`, cast by PostgreSQL. A C# enum would need a second edit every time the database adds a value, and a stale C# enum rejects a value the database accepts. |

---

## 16. Observability and what must not be logged

`IMPROVEMENT_PLAN.md` §13 asks for `pg_stat_statements`, Sentry and four alerts. The API adds the HTTP half.

```csharp
// every request emits exactly these fields
log.LogInformation(
  "request method={Method} route={Route} procedure={Procedure} status={Status} " +
  "duration_ms={Duration} brand={BrandSlug} role={DbRole} user_hash={UserHash} " +
  "request_id={RequestId} code={Code}", ...);
```

| Logged | Never logged |
|---|---|
| Route template (`/v1/practices/{p}/clients`) | The resolved URL with ids, or any query string |
| Procedure name | Request body, response body, or any column value |
| Error **code** from the vocabulary | `PostgresException.Detail`, `.Hint`, `.Where`, or the statement text |
| `brand_slug`, `db_role`, duration, status | Email addresses, phone numbers, client or patient names |
| A salted hash of `sub` | The raw `sub`, the bearer token, or any part of it |
| — | **The queue `public_token`** — exclude `/v1/queue/tokens/*` from access logs entirely; it is a credential (D-07) |

The salted-hash-of-`sub` rule is what lets you debug "this user keeps getting 403" without the log becoming a register of who used the platform. Hash with a per-environment salt from the secret store, not a constant.

### Alerts

| Alert | Threshold | Why |
|---|---|---|
| `42501` rate | > 1% of authenticated requests, 5 min | Either an RLS regression or a missing `EXECUTE` grant after a deploy (§10) |
| `57014` (`statement_timeout`) | any sustained occurrence | A query shape regressed; `IMPROVEMENT_PLAN.md` §3's search is the likely one |
| `53300` (too many connections) | any | `MaxPoolSize × instances` has exceeded `bb_api`'s limit |
| `brand_unresolved` | > 10 / min for one host | DNS misconfiguration or probing |
| p99 latency per route | > 2× 7-day baseline | |
| `too_many_holds` (`54000`) | any burst | Diary DoS attempt — the surface `IMPLEMENTATION_PLAN.md` §8 item 3 names |

Correlation: generate `X-Request-Id` if absent, return it on every response including errors, put it in the `ProblemDetails` as `request_id`, and forward it to Postgres as part of `ApplicationName` or a `set local application_name` so a slow query in `pg_stat_statements` can be traced to a request. Trace with OpenTelemetry: one span per request, one child span per procedure call tagged with the procedure name.

---

## 17. Configuration and secrets

| Setting | Source | Note |
|---|---|---|
| `ConnectionStrings__BabyBlue` | Secret store (Azure Key Vault / AWS Secrets Manager), never appsettings | `bb_api` credentials, `SslMode=VerifyFull` |
| `Supabase__Url` | Environment | Public |
| `Supabase__JwtSecret` | Secret store | **Only** if still on legacy HS256; absent with JWKS |
| `Auth__UserHashSalt` | Secret store | Per environment |
| `Cors__AllowedOrigins` | Derived from `tenant_brand_domains` at startup, refreshed hourly | Not a static list — a new brand domain must not need a deploy |
| Supabase **service-role key** | **Not present in this application** | §18 |

`SslMode=VerifyFull` and not `Require`: `Require` encrypts without verifying the certificate, which stops a passive observer and not an active one. The connection carries every patient record in the system.

Fail fast at startup: validate configuration with `IValidateOptions<T>`, open one connection, call `select 1`, and assert that `current_user = 'bb_api'` and `pg_has_role(current_user, 'authenticated', 'member')`. A misconfigured role is better discovered at boot than on the first patient's booking.

---

## 18. The one service-role use

`/api/leads` is the only server-side path using the Supabase service-role key (`ARCHITECTURE.md`), because `leads` is unreachable by client roles by design.

**Recommendation: leave it in Next.js.** It is one endpoint, it is already written, it has no brand dimension, and keeping the service-role key out of this application entirely means a vulnerability in any of the 106 endpoints cannot reach it.

If it must move, then: a separate `NpgsqlDataSource` with separate credentials, constructed in a separate DI scope that no controller can resolve, reached only through one `ILeadsWriter` abstraction, with its own `platform_lead_create` procedure rather than table access — and the in-memory throttle replaced by the Vercel WAF rule (5/hour/IP) as `IMPROVEMENT_PLAN.md` §10 specifies. Record the decision either way; a service-role key that drifts into the main data source is the single worst configuration mistake available in this design.

---

## 19. Security headers, CORS, transport

```csharp
app.Use(async (ctx, next) =>
{
    var h = ctx.Response.Headers;
    h["Strict-Transport-Security"]  = "max-age=63072000; includeSubDomains; preload";
    h["X-Content-Type-Options"]     = "nosniff";
    h["Referrer-Policy"]            = "no-referrer";
    h["Cross-Origin-Resource-Policy"] = "same-site";
    h["Cache-Control"]              = "no-store";   // overridden only by the output-cache policies
    h.Remove("Server");
    h.Remove("X-Powered-By");
    await next();
});
```

CORS allows exactly the verified domains from `tenant_brand_domains` plus the Vercel preview pattern in non-production. `AllowAnyOrigin` is never acceptable: these endpoints carry bearer tokens, and `AllowCredentials` with a wildcard is rejected by browsers anyway, which would mask the mistake until something else broke.

HTTPS only; `UseHttpsRedirection` plus HSTS. If the API sits behind a reverse proxy, configure `ForwardedHeaders` with a known-proxies allowlist — otherwise `ClientIpOf()` reads an attacker-supplied `X-Forwarded-For` and every IP-keyed rate limit in §12 is trivially bypassed.

---

## 20. Testing

The valuable half of the test suite is the denial half, exactly as `STORED_PROCEDURES.md` §21 says of the database tests. The same logic applies here, with one addition: these tests also prove the API has not *weakened* the database's answer.

### Integration tests — Testcontainers, real PostgreSQL, real migrations

For each of the 106 endpoints:

| Test | Expect |
|---|---|
| Happy path with a correctly scoped token | `2xx` and the documented shape |
| No `Authorization` header | `401`, and the procedure was never called |
| Token for a member of **another** practice | `403` with `code: "forbidden"` |
| Token for a member holding a **lesser** role, where the procedure names a role | `403` |
| Anonymous route response | contains no personal field (assert on the JSON keys, not the values) |

Plus the tests that are about this layer specifically and cannot be written against the database alone:

| Test | Why it matters |
|---|---|
| After a request, a **new** connection from the pool has `search_path` unset, `current_role = 'bb_api'`, and `request.jwt.claim.sub` empty | The `set local` discipline (§3). Run brand A's request, then brand B's, on a pool of size 1, and assert B sees none of A. This is the single most important test in the suite. |
| A request to an unknown Host returns `404` even with a valid token | `MULTITENANCY_PLAN.md` §5 rule 2 |
| A request with a token whose `role` claim is `service_role` still runs as `authenticated` | §3 detail 4 |
| A request with no `set local role` applied (via a deliberately broken gateway) fails with `42501` | Proves `noinherit` is doing its job (§4) |
| No response to a request carrying `Authorization` is marked cacheable | §13 |
| The set of procedure codes in `Codes`, in `MESSAGES`, and raised by the procedures are **equal** | §10 — a new code cannot be added to one of the three and forgotten in the others |
| `select 1` with a 20s `pg_sleep` returns `504` with `code: "statement_timeout"` | Proves the per-transaction `statement_timeout` is applied, i.e. §3 detail 2 is not silently inert |
| The generated files match a fresh generation against the migrated database | `git diff --exit-code` after `dotnet run --project tools/BabyBlue.ContractGen` |
| Two concurrent `POST /queue/call-next` return different entries | The concurrency property `STORED_PROCEDURES.md` §21 requires, now across HTTP |
| 11 rapid `POST /v1/me/holds` — the 11th is `429` | §12, and that it agrees with the database trigger |

### Unit tests

Controllers with a faked procedure interface: parameter binding, status-code mapping, `ProblemDetails` shape. Middleware in isolation: brand resolution including the negative cache, caller-context construction, rate-limit partition keys. These are fast and should carry the bulk of the count; they prove nothing about security, which is what the integration suite is for.

### Load

One scenario before go-live: `GET /v1/directory/practitioners` at the corpus size `IMPROVEMENT_PLAN.md` §3 measured (640 practitioners), with the cache cold, asserting p99 under the budget and that `MaxPoolSize` is not exhausted. The §3 fix is a query-shape change behind the procedure surface; this test is how you find out it regressed.

---

## 21. How the Next.js side changes

Smaller than it looks. `STORED_PROCEDURES.md` §20 already puts every call behind one typed module per domain in `src/lib/api/`; this layer changes only what those modules do inside.

```ts
// src/lib/api/http.ts — the new single transport
const API = process.env.NEXT_PUBLIC_API_BASE_URL!;

export async function call<T>(
  path: string, init: RequestInit & { token?: string | null } = {}
): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
      ...init.headers,
    },
    cache: "no-store",
  });
  if (!res.ok) throw new ApiError(await res.json());   // { code, request_id }
  return res.status === 204 ? (undefined as T) : res.json();
}

// src/lib/api/practice.ts — the type is unchanged from STORED_PROCEDURES.md §20
export const listClients = (token: string, practiceId: string, q?: string, limit = 50, offset = 0) =>
  call<ClientRow[]>(
    `/v1/practices/${practiceId}/clients?` +
    new URLSearchParams({ ...(q ? { q } : {}), limit: String(limit), offset: String(offset) }),
    { token });
```

| Stays | Changes | Goes |
|---|---|---|
| Marketing site, static listing shells, Flow demo (`src/local/*`) | `src/lib/api/*` — `rpc()` becomes `call()`; the exported signatures and row types do not move | SQL strings in `src/app` and `src/components` (already going, D-26) |
| `MESSAGES` in `src/local/db.ts` — now keyed on `ApiError.code` | Public listing pages become Server Components calling the API (`IMPROVEMENT_PLAN.md` §6 item 2, D-17's swap point) | Direct `@supabase/supabase-js` data calls |
| Supabase Auth in the browser, for sign-in and the token | `src/server/tenant.ts`'s `withBrand()` — superseded by §14 | |

The error-message map keyed on code means the user-facing copy never moves to C#, and `src/local/db.ts`'s `MESSAGES` remains the single contract it is described as being.

---

## 22. Where this fits the implementation plan

This layer is a **re-shaping of `IMPLEMENTATION_PLAN.md` Stage 4**, not an extra stage. It changes nothing before it.

| Stage | Effect |
|---|---|
| 0 — live bug fixes | Unaffected. Do now. |
| 1 — security defaults, region | Unaffected and **more** important: `revoke execute … from public` is what the generator asserts (§6), and the region decision now covers two hosting locations, not one (§25). |
| 2 — 4NF rewrite | Unaffected. Still the one-time window, still before any real record. The generator runs against the post-2 schema, so building the API before Stage 2 means generating twice. **Do Stage 2 first.** |
| 3 — procedures, additive | **Unaffected and now the hard prerequisite.** The API has no contract until the procedures exist. Nothing in §5–§8 can be built against a schema without them. |
| 4 — move the app onto them | **This is where the layer lands.** Instead of 123 call sites becoming `supabase.rpc`, they become `call()` against these endpoints. Same domain-by-domain order (`patient/*` → `practice/*` → `components/os/*` → `lib/*-data.ts`), same reversibility, roughly +1–2 weeks for the API scaffold on top of Stage 4's 2–3. |
| 5 — revoke table grants | Unaffected, and **easier to verify**: once the browser holds no connection, a missed statement cannot hide in a component. Still all-or-nothing, still the breaking step. |
| 6 — go live | Changed in two ways: the pooling decision in §4 supersedes Supavisor transaction mode for the request path, and the per-user rate limits of §12 become buildable rather than aspirational. |
| 7 — schema-per-brand | **Cheaper.** `withBrand()` is §14, written once in the API. `MULTITENANCY_PLAN.md`'s observation that the schema move is "a server-side change" behind a procedure surface is literally true here. |
| 8 — clinical | Each phase is a per-brand flag check in §14 plus new generated endpoints. Stage 8B's deletion-semantics change is the `DELETE /v1/me` copy and the `has_records` → `409` mapping, in the same release (D-29). |

### Suggested build order within Stage 4

| Step | Work | Exit |
|---|---|---|
| 4.0 | `bb_api` role, data source, `SessionContext`, gateway, generator, error middleware, JWT, brand middleware. Two endpoints end to end: `GET /v1/directory/cities` (anonymous) and `GET /v1/practices` (authenticated). | The `set local` isolation test of §20 passes. **Do not proceed until it does** — everything after it inherits the mechanism. |
| 4.1 | Generate all 106; implement the 10 public endpoints; Next.js listing pages move to Server Components calling them. | Public site served through the API, cached per §13. |
| 4.2 | `patient/*` — 13 endpoints, plus the `SlotHold` rate limit and the booking conflict mapping. | A patient can search, hold, book, cancel and reschedule through the API. |
| 4.3 | `practice/*` — 60 endpoints, in the §8 sub-domain order. | No SQL left in `src/app/practice`. |
| 4.4 | `growth/*` (16) and `platform/*` (5), including the two binary routes. | No SQL left in `src/`. |
| 4.5 | Observability, alerts, load test, OpenAPI published. | Stage 5 can be scheduled. |

Each step is one PR per domain, per `IMPLEMENTATION_PLAN.md` §7.

---

## 23. POPIA consequences of this layer

Introducing the API creates obligations that do not exist in the current shape, and they are not paperwork — two of them block go-live.

| Consequence | Action |
|---|---|
| **A second processing location.** Every patient record now passes through the API's host. | The s72 determination (`IMPLEMENTATION_PLAN.md` decision 1) must cover **both** the Supabase region and the API's hosting region, and they should be the same region. A `.NET` host cannot run on Vercel, so this is a new provider — Azure App Service, Azure Container Apps, AWS App Runner or Fly.io, with a South African or EU region per the determination. |
| **A new sub-processor.** | Add the hosting provider to the sub-processor and data-location register (`COMPLIANCE.md`, open item). |
| **A new log surface holding personal data, if done carelessly.** | §16's rules are the control. An access log with full URLs is a register of which patient viewed which practitioner. |
| **The s23 access and s14 deletion routes now run through the API.** | `GET /v1/me/export` and `DELETE /v1/me` must be tested as user-facing journeys, not just as endpoints, and `DELETE /v1/me`'s `has_records` → `409` must carry copy the patient can act on. |
| **The operator agreement describes the architecture.** | It must name the API host. Open legal item; it was already open for Supabase. |

The determination is the item with external lead time. It was already decision 1 in `IMPLEMENTATION_PLAN.md`; this layer widens its scope but does not change its urgency — **it is still the thing to start on day one.**

---

## 24. Risks, and what would make this the wrong choice

| Risk | Mitigation |
|---|---|
| **The API becomes a confused deputy.** Someone adds a convenience path that connects with elevated privileges "just for this one admin screen". | `noinherit` on `bb_api` (§4); no service-role key in the application (§18); the §20 test asserting a missing `set local role` fails with `42501`. This is the risk that would undo the whole security model, and it arrives as a small, reasonable-looking PR. |
| **Session state leaks across requests.** | `set local` only; `NoResetOnClose=false`; the pool-isolation test of §20 as a permanent CI gate. |
| **Generated contracts drift from the database.** | Generation is a CI step with `git diff --exit-code`; the generator fails the build if any procedure lacks a method or any function is executable by `PUBLIC`. |
| **The API re-grows business logic.** A validation rule gets added in C# "because it's faster than a migration". | Code review rule: a controller action is bind-call-return. Any `if` in a controller that is not shape validation is a review block. |
| **Latency regression on the booking path.** An extra hop on `hold → book`, which is the most time-sensitive flow in the product. | Co-locate the API with the database region; measure `POST /v1/me/holds` p99 explicitly in the §20 load test; keep the transaction to one procedure call. |
| **In-process rate limiting is per-instance.** | Known and recorded (§12). Distributed limiter before the second instance. |
| **Two deployment units drift.** A procedure signature changes; the API deploys first or last. | Generated contracts make the mismatch a build failure, not a runtime one. Deploy order: migrations → API → Next.js. Additive procedure changes only, during Stage 3's additive window. |
| **A second language splits a one-developer team.** `IMPLEMENTATION_PLAN.md` §3 assumes one experienced developer; §4's parallel split assumed Postgres vs TypeScript. | This adds a third track. With one developer, expect Stage 4 to take longer than its 2–3 weeks, not shorter. |

### When not to build this

Be willing to drop it if any of these is true:

- **The team is one TypeScript developer and the goal is a pilot practice this quarter.** Supabase's direct-JWT path gets to the same security posture with less to build, and Stage 4 as originally written is strictly less work. The API's advantages are all about scale, white-label and non-browser clients — none of which is tomorrow's problem.
- **There is no .NET experience on the team.** The mechanism in §3 is unforgiving; a mistake there is silent and severe.
- **There will only ever be one brand and one client.** §14 is the single strongest argument for the layer, and it evaporates.

Conversely, the case is strongest if a mobile app, a PMS integration, a claims switch (Stage 8D) or a white-label tenant is real within twelve months — which is `IMPLEMENTATION_PLAN.md` decision 4, still open.

---

## 25. Decisions needed from a human

| # | Decision | Blocks | Urgency |
|---|---|---|---|
| 1 | **Hosting target and region for the API**, recorded in the same POPIA s72 determination as the Supabase region (§23) | Everything | **Now** — external lead time, and it widens `IMPLEMENTATION_PLAN.md` decision 1 |
| 2 | **Record D-30**: the stack addition, superseding D-01's "do not migrate stacks" and amending `ARCHITECTURE.md`'s request path | Starting the build | Now |
| 3 | **Supabase JWT signing: asymmetric (JWKS) or legacy HS256?** (§11) | Auth wiring | Before step 4.0 |
| 4 | **Does `/api/leads` stay in Next.js?** (§18) | Whether the service-role key enters this application at all | Before step 4.0 — recommendation: yes, it stays |
| 5 | **Direct Postgres endpoint or Supavisor session mode?** (§4) | Connection string, pool sizing | Before step 4.0 — recommendation: direct |
| 6 | **Distributed rate limiter now or later?** (§12) | Whether a Redis integration is provisioned in Stage 6 | Before go-live with more than one instance |
| 7 | **Does the API own public pages, or do Server Components keep calling Postgres directly?** (§21) | Whether the 10 public endpoints are built in step 4.1 or deferred | Before step 4.1 — recommendation: the API owns them, so one cache and one rate limit cover every caller |

Decisions 1 and 2 are the only ones needed before work starts.

---

## 26. Definition of done

The layer is complete when all of the following hold:

- [ ] `grep -rE "select |insert |update |delete " src/app src/components` returns nothing (Stage 4's exit, unchanged).
- [ ] All 106 procedures have a generated method, a route, an OpenAPI description and at least two tests (happy path + denial).
- [ ] The pool-isolation test of §20 passes and runs on every CI build.
- [ ] `Codes` (§10), `MESSAGES` (`src/local/db.ts`) and the set of codes the procedures raise are proven equal by a test.
- [ ] No function in the brand schema is executable by `PUBLIC`, asserted by the generator and by a database test (Stage 1's exit criterion, enforced twice).
- [ ] The API application's configuration contains no Supabase service-role key.
- [ ] `bb_api` is `noinherit`, `nobypassrls`, owns no table, and has no direct table privileges.
- [ ] Every authenticated response is `no-store`, proven by a test.
- [ ] The six alerts of §16 are live and have fired at least once in staging.
- [ ] The API's hosting region matches the recorded POPIA s72 determination, and the provider is in the sub-processor register.
- [ ] `DECISIONS.md` carries D-30; `ARCHITECTURE.md`'s overview diagram and "Roles and access" table are updated; `PROGRESS.md` reflects the stage.

---

## 27. If only three things get done

1. **§3, exactly as written.** The `set local` preamble with the identity GUCs, the two-value role allowlist and the per-transaction `statement_timeout`. Get this wrong and the API is either broken for every caller (`not_authenticated` everywhere) or silently bypassing RLS — and the second one looks like it works.
2. **§6, the generator.** 4,000 lines of hand-written mapping between C# and 106 procedures will drift, and drift here reintroduces the exact problem D-26 removed. Generate it, commit it, gate it in CI.
3. **The pool-isolation test in §20.** Brand A's request followed by brand B's, on a pool of size 1, asserting B inherits nothing. It is the only test that proves the central mechanism, and it is the one that will catch the convenience PR in §24 that would otherwise undo everything.
