# BabyBlue Implementation Plan

How to execute [`DATABASE_SCHEMA_4NF.md`](DATABASE_SCHEMA_4NF.md), [`STORED_PROCEDURES.md`](STORED_PROCEDURES.md), [`IMPROVEMENT_PLAN.md`](IMPROVEMENT_PLAN.md) and [`MULTITENANCY_PLAN.md`](MULTITENANCY_PLAN.md).

Those four documents say *what* to build and are detailed enough to work from. This one says **in what order, what blocks what, and what has to be decided by a human first**. It adds no new technical content.

---

## 1. The decision that shapes everything else

BabyBlue is **not live**. Supabase is not provisioned, there is no auth, and the only database is the browser demo (D-17). That is unusual and it is an advantage: almost everything in the four documents is cheaper now than it will ever be again.

But two of the four have very different cost profiles, and conflating them produces the wrong plan:

| Work | Cost now | Cost after launch | Why |
|---|---|---|---|
| **4NF schema rewrite** | Rewrite 5 migration files | Rewrite + backfill + compatibility views + a staged column drop, per change, against live patient data | The in-place rewrite is a **one-time window** that closes at the first real patient record |
| **106 stored procedures** | ~4 weeks | ~4 weeks | Purely additive. Only the final `revoke` is breaking, and that can happen whenever |

So the usual "refactor first or ship first" dilemma does not apply evenly. The recommendation:

> **Take the schema window now. Let the procedure surface straddle launch.**

Capture everything that is irreversible-ish or structural before the first real record — the 4NF shape, the Tier 0 security defaults, the indexes, the search fix. Build the procedure surface incrementally, before *and* after launch, and perform the breaking `revoke` once it is complete.

This costs roughly **3–4 weeks before launch** rather than the ~10 weeks a full refactor-first path would cost, and forfeits nothing that cannot be recovered later.

### The alternative, stated fairly

**Launch first on the current schema.** Legitimate if there is commercial pressure to get a pilot practice on by a fixed date. The price is permanent: every item in `DATABASE_SCHEMA_4NF.md` becomes an additive migration with backfill and a compatibility layer, and the consent model in particular (§10) is a POPIA problem the longer it stays a boolean that withdrawal erases. If this path is taken, do **Stage 1 security items anyway** — they are one-line changes and the rest of the plan survives.

---

## 2. What blocks what

```
  Region decision (POPIA s72)  ─────────────┐   external, no code, blocks everything
  Legal review (clinical)  ─────────────┐   │   external, blocks Stage 8 only
                                        │   │
Stage 0  Live bug fixes ────────────────┼───┼──► independent, do immediately
                                        │   │
Stage 1  Security defaults + region ◄───┼───┘
            │                           │
Stage 2  4NF rewrite  ◄── the one-time window
            │
Stage 3  Procedures (additive) ──┐
            │                    │
Stage 4  App moves to procedures │
            │                    │
Stage 5  Revoke table grants ◄───┘   breaking, all-or-nothing
            │
Stage 6  Supabase live + auth + booking MVP   ◄── ROADMAP "Now" 1–4
            │
Stage 7  Schema-per-brand (multitenancy phase 1)
            │
Stage 8  Clinical phases A → B → C → D   ◄── each gated on legal sign-off
```

Three ordering rules that are not preferences:

1. **Stage 2 before Stage 6.** Once a real patient record exists, the in-place rewrite is gone.
2. **Stage 3–4 before Stage 7.** With 123 `public.`-qualified SQL statements spread across 30 component files, moving to brand schemas is a 30-file rewrite with no way to test incrementally. Behind one procedure surface it is a server-side change. This is why the schema move is cheap *only* in this order.
3. **Stage 8B changes a user-facing promise.** The moment clinical records exist, a patient can no longer have their data deleted on request (HPCSA retention overrides POPIA s14). `patient_account_delete` and its copy must change **in the same release**, or the product promises something it cannot do.

---

## 3. Stages

Effort assumes **one experienced developer working full time**, comfortable with PostgreSQL. Treat the ranges as ±50% — they are sequencing aids, not commitments.

### Stage 0 — Fix what is already broken · 1 day

Independent of everything. Do it now.

- `src/app/practice/team/page.tsx:318` — direct `update practice_members set role` bypasses the last-owner guard; an owner can demote themselves and leave a practice with no owner.
- `src/app/practice/admin/page.tsx:23` — selects `profiles.full_name`, which does not exist. That query fails at runtime.

**Exit:** both fixed, a test for each.

### Stage 1 — Decisions and free security · 2–3 days (plus decision latency)

The highest value-per-effort work in the whole plan.

- **Choose the Supabase region** and write it down as a POPIA s72 determination (`IMPROVEMENT_PLAN.md` §15). This is a legal determination, not a latency preference. **It blocks Stage 6 and has an external lead time — start it on day one.**
- `revoke execute … from public` on all functions, plus `alter default privileges`. PostgreSQL grants `EXECUTE` to `PUBLIC` by default, so a `SECURITY DEFINER` function is callable by every role unless revoked. One line; the single highest-value change in the documents.
- `force row level security` on personal-data tables, so the table owner obeys its own policies.
- `statement_timeout` and `idle_in_transaction_session_timeout` per role.
- Name the POPIA Information Officer (also required before the site may be indexed, D-12).

**Exit:** region recorded in `DECISIONS.md`; a test asserting no function in `public` is executable by `PUBLIC`, so this cannot silently regress.

### Stage 2 — The 4NF rewrite · 2–3 weeks · ⚠ one-time window

Rewrite `0001`–`0005` in place; bump `LOCAL_DB_VERSION` 7 → 8.

Order within the stage: reference tables → decompositions → generated columns and constraints → functions updated for new names → RLS for new tables → `src/local/seed.ts` → tests.

**Exit:** `npm test` green with the new tests from `DATABASE_SCHEMA_4NF.md` §22 — notably that `during` cannot be written directly, that consent withdrawal preserves the original grant, and that editing a service price does not change reported historical revenue.

**Risk:** this is the single largest schema change the project will ever take. It is safe *only* because there is no production data. Do not start it if Stage 6 has already happened.

### Stage 3 — Procedures · 3–4 weeks · additive, safe to interleave

Add all 106 procedures and their grants. Nothing breaks: adding a function changes no behaviour. Build them domain by domain with tests as you go (~270 database tests at the end, and the authorisation-denial half is the valuable half).

**Exit:** every procedure has a happy path and at least one denial test; table grants still untouched.

### Stage 4 — Move the app onto them · 2–3 weeks

Replace 123 call sites across 30 files with typed wrappers in `src/lib/api/`, one domain at a time: `patient/*` → `practice/*` → `components/os/*` → `lib/*-data.ts`. Each domain is independently shippable and reversible.

**Exit:** no SQL strings left in `src/app` or `src/components`.

### Stage 5 — Revoke table grants · 1 day · ⚠ breaking

`revoke select, insert, update, delete … from authenticated` and `anon`, re-granting only the six reference tables. Deliberately all-or-nothing: a partial revoke leaves some reads protected and some not, with nothing to tell them apart. Any missed statement fails immediately and loudly, which is the intended outcome.

**Exit:** full suite green, every screen clicked through. This is the point at which RLS becomes the *second* line of defence rather than the first — i.e. where `ARCHITECTURE.md`'s stated principle becomes true.

### Stage 6 — Go live · 3–4 weeks

`ROADMAP.md` "Now" items 1–4, with the performance work folded in because it is cheaper to build correctly than to retrofit:

- Provision Supabase in the Stage 1 region; apply migrations.
- Supabase Auth; delete the PBKDF2 shim.
- Supavisor transaction mode; move public reads to Server Components.
- The index set, the two-phase search fix, `search_vector`.
- Slot-hold quota trigger and edge rate limits — **`hold_slot` is a denial-of-service surface on a real practice's diary** and must not go live unguarded.
- `pg_stat_statements`, Sentry, the four alerts.
- The multi-connection concurrency test (`ROADMAP.md` item 5). All 82 current database tests are single-connection, so **no concurrency guarantee in the schema is presently covered** — and `no_double_booking` is the property the whole booking model rests on.

**Exit:** a real practice can be onboarded. The window from Stage 2 is now closed.

### Stage 7 — Schema-per-brand · 2–4 weeks

`MULTITENANCY_PLAN.md` phases 1–3: move the schema to `bb_babyblue`, add `withBrand()` routing, then `bb_template` + `clone_schema` + `verify_brand` + the migration fan-out, then theming, copy and domains.

**Do phase 1 even with one brand.** It is a rename today; after a second brand's data is interleaved in `public` it is a migration with downtime.

**Exit:** a second brand provisioned from the template passes `verify_brand`, and the isolation suite proves cross-brand reads return zero rows.

### Stage 8 — Clinical · phased, each gated

A (extension fields, ~2 weeks) → B (encounters and notes, ~4–6 weeks **plus legal sign-off**) → C (charting and codes, ~4 weeks) → D (claims, large, needs a build/buy decision on the switch integration).

Each is a per-brand feature flag defaulting to off. Do not start B without the legal review and the revised deletion semantics in the same release.

---

## 4. What can run in parallel

With a second developer, the clean split is **database vs application**:

| Track A (Postgres) | Track B (TypeScript) |
|---|---|
| Stage 2 — 4NF rewrite | Stage 0 bug fixes |
| Stage 3 — procedures | `src/lib/api/` wrappers and types against the agreed signatures |
| Stage 6 — indexes, search, pooling | Stage 4 — call-site migration, domain by domain |
| Stage 7 — template, clone, fan-out | Stage 7 — routing, theming, domains |

The seam is the procedure signatures in `STORED_PROCEDURES.md`: agree them first and both tracks can move without blocking each other. Stage 5 is the synchronisation point and needs both.

---

## 5. Decisions needed from you

| # | Decision | Blocks | Urgency |
|---|---|---|---|
| 1 | **Supabase region**, recorded as a POPIA s72 determination | Stage 6, everything after | **Now** — external lead time |
| 2 | **Schema window: take it or launch first?** (§1) | Stage 2 | **Now** |
| 3 | POPIA Information Officer named | Indexing the site (D-12), compliance posture | Now |
| 4 | Is a second brand real within 12 months? | Whether Stage 7 phase 1 happens before or after launch | Before Stage 6 |
| 5 | Does BabyBlue hold clinical records at all? | Whether Stage 8 exists | Before Stage 8 |
| 6 | Claims switching: build or buy? | Stage 8D scope | Before Stage 8D |
| 7 | One developer or two? | Whether §4 applies | Before Stage 2 |

Decisions 1 and 2 are the only ones needed this week.

---

## 6. Rough shape of the timeline

One developer, full time, recommended path:

| | Stages | Elapsed |
|---|---|---|
| Before launch | 0, 1, 2 + part of 3 | ~4–5 weeks |
| To live | 6 (with 3 continuing) | ~8–10 weeks |
| To no-SQL-in-client | 4, 5 | ~13–15 weeks |
| To first white-label tenant | 7 | ~18–20 weeks |
| Clinical | 8A–D | +3–6 months, gated |

Two developers on the §4 split compresses the middle by roughly a third, not a half — Stage 2 and Stage 5 do not parallelise.

---

## 7. How to land it

Per [`CONTRIBUTING.md`](CONTRIBUTING.md): branch off `dev`, PR into `dev`, `dev` → `staging` → `main`, and production only on explicit say-so (D-14, D-20). One PR per stage, except Stage 3 and Stage 4, which should be one PR per domain so review stays tractable.

Each stage closes with a `DECISIONS.md` entry when it settles something, and `PROGRESS.md` updated. `npm test` and `npm run typecheck` must pass before every merge.

---

## 8. If only three things get done

1. **Stage 1's `revoke execute … from public`.** One line. Without it the grant model in `0003_rls_and_grants.sql` does not actually restrict anything.
2. **Stage 2, before a real patient record exists.** The only item here with a hard deadline set by something other than choice.
3. **The slot-hold quota, before launch.** `hold_slot` is callable in a loop by any signed-in user and holds last five minutes; unguarded, it can keep a real practice's diary permanently unbookable.
