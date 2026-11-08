# BabyBlue Multi-Tenant White-Label Upgrade Plan

**Status:** plan. Nothing in this document has been applied to the repository.
**Model:** a practice is the tenant of record; a **schema per white-label brand** is the unit of physical separation.
**Companions:** [`DATABASE_SCHEMA_4NF.md`](DATABASE_SCHEMA_4NF.md) · [`STORED_PROCEDURES.md`](STORED_PROCEDURES.md) · [`IMPROVEMENT_PLAN.md`](IMPROVEMENT_PLAN.md)

---

## 1. What is being built

BabyBlue today is one product with many practices in it. The upgrade makes it a **platform that can be deployed under someone else's brand**, while keeping the practice as the unit that owns data.

Three things are deliberately kept apart, because conflating them is the usual way these projects go wrong:

| Concept | Meaning | Where it lives |
|---|---|---|
| **Practice** | A dental or medical practice. Owns clients, appointments, staff, diaries. The tenant of record and the unit of data ownership. | A row in `practices`, inside a brand schema |
| **Brand** | A white-label deployment: its own domain, logo, palette, copy, email sender, commercial terms. Contains one or many practices. | A PostgreSQL schema plus a row in the shared registry |
| **Practice group** | Several practices under common management (a three-branch dental group) | Several `practices` rows in the same brand schema, sharing owners via `practice_members` |

A brand is **not** a reseller hierarchy and **not** a second tenancy layer above the practice. RLS continues to key on `practice_id` exactly as it does today (D-04), unchanged. The schema is an outer wall, not a replacement for the inner one.

Examples of what a brand is:

- `babyblue` — the public platform, many unrelated practices, the directory and Growth.
- `smilegroup` — a dental group's own branded portal at `book.smilegroup.co.za`, containing its three practices. Its patients never see BabyBlue.
- `medsuite` — a practice-management vendor reselling BabyBlue to its own customers under its own name.

## 2. Why schema-per-brand rather than the alternatives

| Model | Isolation | Migrations | Backups | Verdict |
|---|---|---|---|---|
| Shared schema + RLS (today) | Policy-dependent | Once | All-or-nothing | Fine for one brand; a mis-written policy crosses brands |
| **Schema per brand** | Structural + RLS | Once per brand | Per brand (`pg_dump -n`) | **Chosen** |
| Schema per practice | Strongest | Once per practice — thousands | Per practice | 2,000 practices × 38 tables ≈ 76,000 tables; catalogue bloat, `pg_dump` cost, unusable migration fan-out |
| Database per brand | Hardest | Per database | Per database | Reserved for the enterprise tier (§12) |

Schema-per-brand sits at the point where the number of units stays in the tens while isolation becomes structural. The decisive property is that **it composes with, rather than replaces, what already exists**: `practice_id` RLS keeps working untouched inside each schema, so BabyBlue gets a third isolation layer rather than a different one.

## 3. Validated isolation model

The arrangement below was built and probed on PostgreSQL (PGlite 0.5.11, the engine behind `tests/db/harness.ts`) before being written down.

```
public                        shared, non-personal, read-only to clients
  ├── countries, provinces, cities, languages, specialities, council_bodies
  ├── tenant_brands            the registry: domain → schema
  └── tenant_brand_domains

auth                          Supabase Auth — ONE identity namespace across all brands
  └── users

bb_babyblue                   brand schema: all 38 tenant-scoped tables
  ├── practices, practice_members, practitioners, clients,
  │   appointments, slot_holds, queue_entries, marketing_*, audit_log …
  └── is_member(), has_practice_role(), and the 106 procedures

bb_smilegroup                 same shape, separate rows, separate policies
bb_medsuite                   same shape
```

Each brand schema carries its own copy of the tenant-local helpers, so an RLS policy can never accidentally resolve membership against another brand:

```sql
create function bb_babyblue.is_member(p_practice uuid) returns boolean
language sql stable security definer set search_path = bb_babyblue, public as $$
  select exists (select 1 from bb_babyblue.practice_members
                  where practice_id = p_practice and user_id = auth.uid())
$$;

create policy clients_member_read on bb_babyblue.clients
  for select to authenticated using (bb_babyblue.is_member(practice_id));
```

Note `set search_path = bb_babyblue, public` with the schema **named explicitly**, not inherited. A `SECURITY DEFINER` function that relied on the caller's `search_path` would be the single worst bug possible here.

### Test results

Two brands, one practice each, one owner each, `clients` under RLS with `force row level security`:

| Probe | Result |
|---|---|
| User A, `search_path = bb_babyblue, public`, `select … from clients` | Returns A's client only |
| User A reads `bb_smilegroup.clients` explicitly | **0 rows** |
| User B, `search_path = bb_smilegroup, public` | Returns B's client only |
| User B reads `bb_babyblue.clients` explicitly | **0 rows** |
| Shared reference data from either brand (`public.provinces`) | Readable from both |
| **User A with `search_path` wrongly pointed at `bb_smilegroup`** | **0 rows** |

The last row is the important one. It means a routing bug — the most likely failure mode in this design — **degrades to an empty result, not a cross-brand data leak**, because RLS inside the target schema still evaluates `is_member()` against `auth.uid()` and the caller is not a member of anything there. Routing is a correctness concern, not a security boundary. That is precisely the defence-in-depth property D-04 was written for, extended one layer out.

## 4. The brand registry

The only new tenant-aware tables, and they live in `public` because routing must be resolvable before a schema is chosen.

```sql
create table public.tenant_brands (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique check (slug ~ '^[a-z][a-z0-9_]{1,30}$'),
  schema_name     text not null unique check (schema_name ~ '^bb_[a-z][a-z0-9_]{1,28}$'),
  display_name    text not null,
  status          text not null default 'provisioning'
                    check (status in ('provisioning', 'active', 'suspended', 'archived')),
  tier            text not null default 'standard'
                    check (tier in ('standard', 'enterprise')),
  country_code    text not null default 'ZA' references public.countries(code),
  default_timezone text not null default 'Africa/Johannesburg',
  -- the brand's own identity
  support_email   text not null,
  from_email      text not null,
  logo_url        text,
  wordmark_url    text,
  favicon_url     text,
  theme           jsonb not null default '{}',   -- CSS custom property overrides, see §7
  copy_overrides  jsonb not null default '{}',   -- product naming, see §7
  features        jsonb not null default '{}',   -- which modules are enabled, see §8
  -- commercial
  contract_ref    text,
  data_region     text not null default 'eu-central-1',
  created_at      timestamptz not null default now()
);

create table public.tenant_brand_domains (
  domain     text primary key check (domain ~ '^[a-z0-9.-]+\.[a-z]{2,}$'),
  brand_id   uuid not null references public.tenant_brands(id) on delete cascade,
  is_primary boolean not null default false,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index tenant_brand_primary_domain
  on public.tenant_brand_domains (brand_id) where is_primary;

-- routing lookup: the hot path for every single request
create or replace function public.resolve_brand(p_host text)
returns table (brand_id uuid, slug text, schema_name text, status text,
               display_name text, theme jsonb, copy_overrides jsonb,
               features jsonb, logo_url text, favicon_url text, support_email text)
language sql stable security definer set search_path = public as $$
  select b.id, b.slug, b.schema_name, b.status, b.display_name, b.theme,
         b.copy_overrides, b.features, b.logo_url, b.favicon_url, b.support_email
    from public.tenant_brand_domains d
    join public.tenant_brands b on b.id = d.brand_id
   where d.domain = lower(p_host) and d.verified_at is not null
     and b.status in ('active', 'provisioning');
$$;

grant execute on function public.resolve_brand(text) to anon, authenticated;
revoke all on public.tenant_brands, public.tenant_brand_domains from anon, authenticated;
```

`tenant_brands` itself is **not** client-readable — `resolve_brand` returns only the presentational fields, so `contract_ref`, `tier` and `data_region` never reach a browser. One brand must not be able to enumerate the others.

## 5. Request routing

```
Request to book.smilegroup.co.za
  │
  ├─ Routing Middleware: resolve_brand(host) → { schema_name: 'bb_smilegroup', theme, features }
  │    cached in Global Config / runtime cache (domains change rarely)
  │    unknown host → 404, NOT a fallback to bb_babyblue
  │
  ├─ Request handler: open a transaction, then
  │      set local search_path = bb_smilegroup, public;
  │      set local role authenticated;
  │      select set_config('request.jwt.claim.sub', <uid>, true);
  │    → call the procedure unqualified
  │
  └─ RLS inside bb_smilegroup evaluates is_member(practice_id) against auth.uid()
```

Three rules that are not optional:

**1. `set local`, never `set`.** [`IMPROVEMENT_PLAN.md`](IMPROVEMENT_PLAN.md) §6 puts the request path behind Supavisor in transaction mode, where a connection is handed to a different client after each transaction. A plain `SET search_path` would leak the brand to whoever gets that connection next — the worst possible bug in this design. `set local` is scoped to the transaction and unwinds with it. The existing `src/local/db.ts` already uses `set local role` and `set_config(..., true)` per transaction, so the pattern is established; it must extend to `search_path` and must never be relaxed.

**2. An unknown host is a 404.** Falling back to the default brand would mean a misconfigured DNS entry silently serves BabyBlue's directory under a client's domain.

**3. The resolved schema name is never user input.** It comes from `tenant_brands.schema_name`, constrained by a regex, and is interpolated into `set local search_path` — there is no parameter placeholder for a schema name. The registry is the allowlist. The same rule as the `rpc()` wrapper in [`STORED_PROCEDURES.md`](STORED_PROCEDURES.md) §20, for the same reason.

```ts
// src/server/tenant.ts
import "server-only";

const SCHEMA = /^bb_[a-z][a-z0-9_]{1,28}$/;

export async function withBrand<T>(
  brand: Brand, uid: string | null, run: (tx: Tx) => Promise<T>
): Promise<T> {
  if (!SCHEMA.test(brand.schema_name)) throw new Error("invalid_schema");  // belt and braces
  return db.transaction(async (tx) => {
    await tx.exec(`set local search_path = ${brand.schema_name}, public`);
    if (uid) {
      await tx.exec("set local role authenticated");
      await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [uid]);
    } else {
      await tx.exec("set local role anon");
    }
    return run(tx);
  });
}
```

## 6. One identity, many brands

`auth.users` is a single Supabase namespace and cannot be partitioned per schema. This is a design consequence worth being explicit about, because it is the one place where brands are not fully separate.

| Question | Answer |
|---|---|
| Can one person use two brands? | Yes — one account, one password, one email. |
| Does brand A learn that the account also exists in brand B? | **No.** Membership, client records, appointments and consents all live in the brand schema. Nothing in `auth.users` reveals brand association, and `tenant_brands` is not client-readable. |
| Can a brand enumerate users? | No. `practice_member_add` resolves an email to a user id inside a `SECURITY DEFINER` procedure and returns `user_not_found` otherwise — it confirms nothing about which brands that person uses. |
| What does a patient see on brand B's site? | Only brand B's practices and their own appointments there. Their BabyBlue appointments are invisible. |
| Where does `profiles` live? | `public`. It holds display name and phone — the person's own data, not the brand's — and it is what makes one sign-in work everywhere. |

The implication to accept: **a person's display name and phone number are shared across brands.** That is correct (it is their own profile, which they control under POPIA s24) but must be in the brand's operator agreement, and a brand must not treat `profiles` as its own CRM record. The brand-held contact details are `clients.email` / `clients.phone` inside its schema, with the precedence rule in `DATABASE_SCHEMA_4NF.md` §18.

## 7. Branding without forking

Everything visual comes from the brand row, so there is exactly one codebase.

### Theme

`DESIGN_SYSTEM.md` and D-02 already centralise design tokens as CSS custom properties in `globals.css` and `site.css` rather than Tailwind — which turns out to be exactly the right substrate for white-labelling. The brand overrides tokens; it does not override components.

```jsonc
// tenant_brands.theme
{
  "--bb-ink":        "#0B1C2C",
  "--bb-primary":    "#1E6FD9",
  "--bb-primary-ink":"#FFFFFF",
  "--bb-accent":     "#E8F1FC",
  "--bb-surface":    "#FFFFFF",
  "--bb-radius":     "14px",
  "--bb-font-display": "'Manrope', system-ui, sans-serif",
  "--bb-font-body":    "'Inter', system-ui, sans-serif"
}
```

Injected once in the root layout:

```tsx
// src/app/layout.tsx
const brand = await resolveBrand(host);
const vars = Object.entries(brand.theme)
  .filter(([k]) => /^--bb-[a-z-]+$/.test(k))        // allowlist: this is injected into CSS
  .map(([k, v]) => `${k}:${cssSafe(v)}`).join(";");
// …<html style={vars}> — no stylesheet per brand, no build per brand
```

The key regex and `cssSafe()` are not decoration. `theme` is tenant-supplied data being written into a style attribute; without an allowlist a brand could inject `url(...)` or escape the declaration. Only `--bb-*` keys pass, and values are restricted to colours, lengths and font stacks.

A brand that needs more than tokens — a different hero layout — gets a *variant*, selected by `features.layout`, not a fork. Variants are enumerated in code.

### Copy

Product names are BabyBlue's, so they must be overridable:

```jsonc
// tenant_brands.copy_overrides
{
  "product.app":    "Smile Booking",
  "product.os":     "Smile Manage",
  "product.flow":   "Smile Queue",
  "product.growth": null,            // module disabled, see §8
  "platform.name":  "SmileGroup",
  "booking.via":    "via SmileGroup"   // the D-22 chip
}
```

D-22's "via BabyBlue" chip becomes `copy_overrides['booking.via']`. The underlying column stays `appointments.source = 'app'`; only the label changes. The *honesty* requirement behind D-22 — a practice always knows a booking came through the platform rather than from its own reception — holds for every brand.

### What a brand may not change

`BRAND.md` sets BabyBlue's voice and trust rules, and some of them are not stylistic:

| Fixed | Why |
|---|---|
| "Verified" is platform-controlled | D-06. A brand cannot self-verify its practitioners; verification means a council registration was checked. Letting a brand set it would make the badge meaningless. |
| No fabricated practitioners, ratings or revenue | D-10 |
| POPIA notice and consent wording | Legal text; a brand supplies its own responsible-party details, not its own consent semantics |
| The cancellation-notice mechanic | A brand sets the *hours*; it cannot remove the window |
| Audit logging | Not optional under POPIA s17 |

These belong in the operator agreement as well as in code.

## 8. Feature flags per brand

```jsonc
// tenant_brands.features
{
  "booking": true,          // App
  "os": true,               // practice OS
  "flow": true,             // live queue
  "growth": false,          // marketing — BabyBlue-operated, usually off for a brand
  "directory": false,       // the public cross-practice directory
  "public_listings": false, // /{speciality}/{city} pages (D-16)
  "clinical": false,        // §10 phase B onwards
  "claims": false,          // §10 phase D
  "layout": "standard"
}
```

`growth` and `directory` default **off** for a new brand, and that is a product judgement rather than a default: Growth is delivered by BabyBlue's own marketing operators, and the directory is BabyBlue's cross-practice index. A dental group's branded portal wants neither. Turning them on for a brand means BabyBlue staff gain `marketing_operator` access into that brand's schema, which is a contractual matter.

Enforced in two places, because one is never enough:

```sql
-- in the brand schema, guarding the data
create or replace function bb_smilegroup._require_feature(p_feature text)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not coalesce((select (features ->> p_feature)::boolean from public.tenant_brands
                    where schema_name = 'bb_smilegroup'), false) then
    raise exception 'feature_disabled' using errcode = '42501';
  end if;
end $$;
```

and in routing, so a disabled module's pages 404 rather than render empty.

## 9. Provisioning a brand

Manual schema creation does not survive the tenth brand. A template schema plus a clone procedure does.

```sql
-- bb_template: the canonical brand schema, created by the same migrations as bb_babyblue.
-- It holds no rows. Every new brand is cloned from it, so drift is impossible by construction.

create or replace function public.provision_brand(
  p_slug text, p_display_name text, p_primary_domain text,
  p_support_email text, p_from_email text, p_country_code text default 'ZA')
returns uuid language plpgsql security definer set search_path = public as $$
declare v_schema text; v_brand uuid; v_obj text;
begin
  if not public.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_slug !~ '^[a-z][a-z0-9_]{1,30}$' then raise exception 'invalid_name' using errcode = '22023'; end if;

  v_schema := 'bb_' || p_slug;

  insert into public.tenant_brands (slug, schema_name, display_name, support_email,
                                    from_email, country_code, status)
  values (p_slug, v_schema, p_display_name, p_support_email, p_from_email, p_country_code, 'provisioning')
  returning id into v_brand;

  -- clone_schema() copies tables, constraints, indexes, sequences, functions, triggers,
  -- policies and grants from bb_template, rewriting schema-qualified references.
  perform public.clone_schema('bb_template', v_schema);

  insert into public.tenant_brand_domains (domain, brand_id, is_primary)
  values (lower(p_primary_domain), v_brand, true);

  perform public._audit(null, 'brand.provisioned', 'tenant_brand', v_brand,
                        jsonb_build_object('slug', p_slug, 'schema', v_schema));
  return v_brand;
end $$;
```

`clone_schema` is the one genuinely fiddly piece and must be written carefully rather than borrowed:

| Must handle | Why |
|---|---|
| `search_path` rewriting inside every function body | A cloned `is_member()` still pointing at `bb_template` would authorise against an empty table — every policy would deny everything, or worse, a cloned policy referencing the source schema would authorise against the wrong rows |
| Policy re-creation with the new schema's helper names | Policies reference functions by qualified name |
| Sequence and identity restart | Cloned sequences must start fresh |
| Grants to `anon` / `authenticated` / `service_role` | Omitting these makes the brand unusable; over-granting makes it unsafe |
| `force row level security` on personal-data tables | `IMPROVEMENT_PLAN.md` §14.3 |
| `revoke execute … from public` on cloned functions | The PostgreSQL default grant applies to cloned functions too |

Provisioning must be **verified, not assumed**. `verify_brand(p_schema)` asserts, before `status` moves to `active`:

- every table that exists in `bb_template` exists in the new schema, with the same columns;
- RLS is enabled *and forced* on every table where the template has it;
- every template policy has a counterpart, and no policy body mentions `bb_template`;
- no function in the new schema is executable by `PUBLIC`;
- `is_member()` resolves against the new schema (assert it returns false for a known foreign user);
- `anon` reads 0 rows from `clients`, `appointments` and `queue_entries`.

The last three are the ones that catch a bad clone. A brand that fails verification stays `provisioning`, which `resolve_brand` serves but which the operator dashboard flags.

## 10. Migrations across brands

With N brands the migration runner must fan out, and partial application is the thing to fear.

```
supabase/migrations/        → applied to bb_template and every bb_* schema
supabase/shared/            → applied to public and auth once (reference data, registry)
```

```sql
create or replace function public.migrate_all_brands(p_sql text, p_version text)
returns table (schema_name text, ok boolean, error text)
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if not public.is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  for r in select b.schema_name from public.tenant_brands b
            where b.status <> 'archived'
            union all select 'bb_template' order by 1 loop
    begin
      execute format('set local search_path = %I, public', r.schema_name);
      execute p_sql;
      insert into public.brand_migrations (schema_name, version, applied_at)
      values (r.schema_name, p_version, now());
      return query select r.schema_name, true, null::text;
    exception when others then
      return query select r.schema_name, false, sqlerrm;
    end;
  end loop;
end $$;
```

Rules:

1. **`bb_template` migrates first.** If it fails there, stop — the template is the definition.
2. **Per-brand transactions, not one global one.** One brand's failure must not roll back twenty successes; the function reports per-schema results and `brand_migrations` records what landed where. A global transaction across 50 schemas would also hold locks far too long.
3. **`brand_migrations` is the source of truth** for which brand is at which version. Brands can legitimately diverge for hours.
4. **Backward-compatible migrations only**, in two steps: add the new thing, deploy code tolerating both, then remove the old thing. Mid-fan-out, some brands are old and some are new, and the single codebase serves both.
5. **CI runs the full fan-out against three seeded brands**, asserting identical schemas afterwards.

This is the real cost of this model, and it should be stated plainly: **every schema change is now an operation with partial-failure semantics.** Point 4 is what makes that survivable.

## 11. Clinical and billing roadmap

`COMPLIANCE.md` currently draws a hard line: `clients` holds "administrative and consent fields only — no clinical records". Crossing that line changes BabyBlue's regulatory position substantially, so it is phased, each phase gated on its own compliance work, each independently shippable, each per-brand via `features`.

### Phase A — Per-speciality extension fields

The smallest useful step, and it crosses no clinical line. A physio wants to record a referral source; a dentist wants a medical-aid scheme name. Neither is a clinical record.

```sql
create table bb_babyblue.practice_field_defs (
  id          uuid primary key default gen_random_uuid(),
  practice_id uuid not null references bb_babyblue.practices(id) on delete cascade,
  entity      text not null check (entity in ('client', 'appointment')),
  key         text not null check (key ~ '^[a-z][a-z0-9_]{1,40}$'),
  label       text not null,
  field_type  text not null check (field_type in ('text', 'number', 'date', 'boolean', 'select')),
  options     text[] not null default '{}',
  required    boolean not null default false,
  sensitive   boolean not null default false,   -- sensitive fields are audited on read
  sort_order  int not null default 0,
  unique (practice_id, entity, key)
);

create table bb_babyblue.client_field_values (
  practice_id uuid not null,
  client_id   uuid not null,
  key         text not null,
  value_text  text, value_number numeric, value_date date, value_boolean boolean,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id) on delete set null,
  primary key (client_id, key),
  foreign key (client_id, practice_id)
    references bb_babyblue.clients(id, practice_id) on delete cascade,
  constraint one_value check (
    (value_text is not null)::int + (value_number is not null)::int +
    (value_date is not null)::int + (value_boolean is not null)::int = 1
  )
);
```

Typed columns with a `one_value` check rather than a single `jsonb` blob: the value stays queryable and typed, which is the whole point of `DATABASE_SCHEMA_4NF.md` §15's objection to metric bags. `sensitive` marks a field whose *reads* get audited — the mechanism Phase B needs.

**Guard rail:** a practice will try to put clinical notes in a `text` field. `practice_field_defs` must therefore state in the UI that these are administrative, and Phase A ships with a `clinical: false` feature flag that keeps the honest line visible. The real answer to that pressure is Phase B, not a loosely-typed text field.

**Compliance:** POPIA s26 prohibits processing special personal information (including health) without a s27 ground. Administrative extension fields are not health data; the moment one is used as such, the practice is outside this phase. Hence Phase B.

### Phase B — Encounters and clinical notes

```sql
create table bb_babyblue.encounters (
  id              uuid primary key default gen_random_uuid(),
  practice_id     uuid not null,
  client_id       uuid not null,
  appointment_id  uuid,
  practitioner_id uuid not null,
  occurred_at     timestamptz not null,
  -- an entry is immutable once signed; corrections are addenda (§Phase B rules)
  signed_at       timestamptz,
  signed_by       uuid references auth.users(id),
  foreign key (client_id, practice_id) references bb_babyblue.clients(id, practice_id),
  foreign key (practitioner_id, practice_id) references bb_babyblue.practitioners(id, practice_id)
);

create table bb_babyblue.encounter_notes (
  id           uuid primary key default gen_random_uuid(),
  practice_id  uuid not null,
  encounter_id uuid not null references bb_babyblue.encounters(id) on delete restrict,
  section      text not null check (section in ('subjective','objective','assessment','plan','addendum')),
  body         text not null,
  author_id    uuid not null references auth.users(id),
  created_at   timestamptz not null default now(),
  supersedes   uuid references bb_babyblue.encounter_notes(id)
);

create table bb_babyblue.clinical_access_log (
  id           bigint generated always as identity primary key,
  practice_id  uuid not null,
  client_id    uuid not null,
  actor_id     uuid not null,
  encounter_id uuid,
  action       text not null check (action in ('read','write','export','print')),
  at           timestamptz not null default now()
);
```

Non-negotiables for this phase:

| Rule | Mechanism |
|---|---|
| A signed note is never edited or deleted | No `UPDATE`/`DELETE` policy on `encounter_notes`; corrections are new rows with `supersedes` and `section = 'addendum'`. `on delete restrict` on the encounter. |
| Only the treating practitioner writes clinical notes | A new `practice_role` of `clinician`, distinct from `staff`. `receptionist` must have **no** read access to clinical data — the current role model gives receptionists full client access, which is correct for administrative data and wrong for clinical. |
| Every read is logged | `clinical_access_log`, written by the read procedure. HPCSA expects an auditable record of who accessed a patient record. |
| Retention outlives everything else | 6 years from last entry; minors to age 21. This **conflicts with POPIA s14 deletion** and with `patient_account_delete` — see below. |
| Explicit s27 ground | Processed for the patient's treatment by a health professional under a duty of confidentiality (POPIA s32). Consent is not the lawful basis and must not be presented as one. |

**`patient_account_delete` must change in this phase.** A patient with clinical records cannot have them deleted on request — the practitioner is legally required to retain them. The procedure already raises `has_records` for an unrelated case; from Phase B it must raise it for clinical records, and the UI must explain that the account is closed and contact details anonymised while the clinical record is retained by the practice under HPCSA rules. Promising full deletion after Phase B would be a false promise.

### Phase C — Dental charting and procedure coding

```sql
create table public.procedure_codes (            -- shared reference, not per brand
  code        text primary key,
  system      text not null check (system in ('icd10', 'cpt4', 'nhrpl', 'sada')),
  description text not null,
  speciality_slug text references public.specialities(slug),
  active      boolean not null default true
);

create table bb_babyblue.tooth_charts (
  id           uuid primary key default gen_random_uuid(),
  practice_id  uuid not null,
  client_id    uuid not null,
  encounter_id uuid references bb_babyblue.encounters(id),
  notation     text not null default 'fdi' check (notation in ('fdi', 'universal', 'palmer')),
  charted_at   timestamptz not null default now(),
  charted_by   uuid not null references auth.users(id),
  foreign key (client_id, practice_id) references bb_babyblue.clients(id, practice_id)
);

create table bb_babyblue.tooth_chart_entries (
  id          uuid primary key default gen_random_uuid(),
  chart_id    uuid not null references bb_babyblue.tooth_charts(id) on delete cascade,
  tooth       text not null,                      -- FDI: '11'..'48', '51'..'85' deciduous
  surface     text check (surface in ('mesial','distal','buccal','lingual','occlusal','incisal')),
  condition   text not null,
  code        text references public.procedure_codes(code),
  notes       text
);

-- a surrogate key plus a unique index, because a PRIMARY KEY may not contain an
-- expression: `primary key (chart_id, tooth, coalesce(surface, ''))` is a syntax error,
-- and a plain (chart_id, tooth, surface) key would allow unlimited duplicates
-- whenever surface is null (whole-tooth findings).
create unique index tooth_chart_entries_uniq
  on bb_babyblue.tooth_chart_entries (chart_id, tooth, coalesce(surface, ''));
```

A chart is a **snapshot**, not a mutable current state: `tooth_charts` rows accumulate and the latest is the current view. That is how a dentist actually works — comparing today's chart to the one from eighteen months ago — and it is also what makes the record defensible. Supporting three notations matters because `notation` determines what `'11'` means; storing it without the notation makes the chart ambiguous.

`procedure_codes` is shared across brands because ICD-10 and the NHRPL are national. Copyright on code sets must be checked before bundling them — ICD-10 is WHO-licensed and the NHRPL/SADA tariff codes have their own terms.

### Phase D — Medical-aid claims

```sql
create table bb_babyblue.medical_schemes (
  id           uuid primary key default gen_random_uuid(),
  practice_id  uuid not null,
  scheme_code  text not null,                    -- BHF / CMS registered scheme
  scheme_name  text not null,
  unique (practice_id, scheme_code)
);

create table bb_babyblue.client_memberships (
  practice_id    uuid not null,
  client_id      uuid not null,
  scheme_id      uuid not null references bb_babyblue.medical_schemes(id),
  membership_no  text not null,
  dependant_code text,
  is_main_member boolean not null default true,
  valid_from     date not null default current_date,
  valid_to       date,
  primary key (client_id, scheme_id, valid_from),
  foreign key (client_id, practice_id) references bb_babyblue.clients(id, practice_id)
);

create table bb_babyblue.claims (
  id             uuid primary key default gen_random_uuid(),
  practice_id    uuid not null,
  encounter_id   uuid not null references bb_babyblue.encounters(id),
  scheme_id      uuid not null references bb_babyblue.medical_schemes(id),
  status         text not null default 'draft'
                   check (status in ('draft','submitted','accepted','rejected','paid','reversed')),
  total_cents    int not null check (total_cents >= 0),
  switch_ref     text,                            -- Healthbridge / MediSwitch reference
  submitted_at   timestamptz, responded_at timestamptz,
  response_code  text, response_message text
);

create table bb_babyblue.claim_lines (
  claim_id    uuid not null references bb_babyblue.claims(id) on delete cascade,
  line_no     int not null,
  code        text not null references public.procedure_codes(code),
  tooth       text,
  quantity    int not null default 1 check (quantity > 0),
  amount_cents int not null check (amount_cents >= 0),
  primary key (claim_id, line_no)
);
```

`client_memberships` is keyed on `valid_from` because scheme membership changes and a claim must be adjudicated against the membership that was valid **on the date of service**, not today's. Getting that wrong is the most common source of rejected claims.

Phase D is the heaviest phase and the one that most needs a build/buy decision: claims switching in South Africa runs through Healthbridge, MediSwitch or similar, each with its own integration and certification. The schema above is the practice-side record; the switch integration is a separate project.

**Compliance for C and D:** membership numbers, dependant codes and procedure codes are all special personal information under POPIA s26. Every table in these phases needs `force row level security`, the `clinical_access_log` treatment, and encryption-at-rest confirmation from the provider. The `clinical` and `claims` feature flags stay off for every brand until that work is signed off per brand.

## 12. The enterprise tier

Some brands will need more than a schema: a tenant whose contract demands isolated backups, an independent maintenance window, or data residency in a country Supabase does not serve from the shared project.

`tenant_brands.tier = 'enterprise'` promotes a brand to its own database.

```
Standard tier    → shared Postgres, schema per brand, RLS per practice
Enterprise tier  → dedicated Supabase project, ONE brand schema inside it
```

The promotion is a data move, not a redesign, which is the payoff of this model:

1. Provision a new project in the required region; run `supabase/shared/` then the brand migrations.
2. `pg_dump -n bb_<brand>` from the shared cluster, restore into the new one. The brand's data is already a self-contained schema — this is the single biggest operational argument for schema-per-brand over shared-schema-plus-RLS.
3. Copy the `auth.users` rows that have membership or client records in that brand. **This is the hard part**, because identity is shared (§6): a person who uses both the enterprise brand and BabyBlue ends up with an account in two projects, and from that moment the two diverge. The operator agreement must say so, and password resets will be per-project.
4. Point the brand's domains at the new deployment; `resolve_brand` returns a connection target rather than just a schema name.
5. Leave the source schema read-only for a grace period, then archive.

Because identity cannot be cleanly split, promotion should be a **provisioning-time decision wherever possible**: a tenant that is going to need isolation should start isolated. Promotion after the fact is supported but is a migration with a user-visible consequence.

## 13. What has to change in the existing codebase

| Area | Change | Size |
|---|---|---|
| `supabase/migrations/` | Objects move from `public` to the brand schema; reference data and the registry stay in `public`. Mechanical but touches every file. | Large |
| Helper functions | `is_member`, `has_practice_role`, `_audit`, `_require_*` become per-schema, with the schema named explicitly in `search_path` | Medium |
| RLS policies | Re-created per schema referencing that schema's helpers | Medium |
| The 106 procedures | Per-schema; unqualified table references resolve via `search_path`. **They must stop writing `public.` in front of tenant tables** — currently all 123 statements do. | Medium |
| `src/local/db.ts` | `set local search_path` added to the transaction wrapper | Small |
| Routing | New middleware resolving host → brand | Small |
| `src/app/layout.tsx` | Brand theme, logo, favicon, copy from `resolve_brand` | Small |
| `src/lib/site.ts`, `BRAND.md` constants | Read from the brand instead of module constants | Medium |
| `src/components/site/*` | Hard-coded "BabyBlue" strings → `copy_overrides` | Medium |
| `src/app/og/` | OG images per brand | Small |
| `tests/db/harness.ts` | Seed two brands and assert cross-brand isolation on every table | Medium |
| `src/local/seed.ts` | Seed into a brand schema | Medium |

**The procedure surface is the thing that makes this tractable**, which is the main reason [`STORED_PROCEDURES.md`](STORED_PROCEDURES.md) is a prerequisite rather than a parallel effort. With 123 `public.`-qualified statements spread across 30 component files, this migration is a 30-file rewrite with no way to test it incrementally. With one procedure surface and one `src/lib/api/` wrapper layer, it is a server-side change behind an unchanged interface.

## 14. Sequencing

| Phase | Work | Prerequisite |
|---|---|---|
| **0** | 4NF rewrite; the 106 procedures; table grants revoked; Tier 0 of the improvement plan | — |
| **1** | Create `public` reference + registry schemas. Move the current schema to `bb_babyblue`. Add `withBrand()` routing. **One brand, so nothing is yet multi-tenant** — but the shape is in place and every test runs through it. | 0 |
| **2** | `bb_template`, `clone_schema`, `provision_brand`, `verify_brand`, `migrate_all_brands`, `brand_migrations`. Provision `bb_demo` and run the full isolation suite against it. | 1 |
| **3** | Theme, copy and feature-flag plumbing. Custom domains with verification. OG images per brand. | 2 |
| **4** | First real white-label tenant. Operator agreement, s72 determination for its region, backup and restore rehearsal. | 3 |
| **5** | Clinical Phase A (extension fields) | 4 |
| **6** | Clinical Phase B (encounters, notes, `clinician` role, access log, revised deletion semantics) | 5 + legal sign-off |
| **7** | Clinical Phase C (charting, procedure codes) | 6 |
| **8** | Clinical Phase D (claims, switch integration) | 7 + a build/buy decision |
| **9** | Enterprise tier promotion | 4 |

Phase 1 is the one to insist on even with a single brand. Retrofitting schema separation after a second brand's data is already interleaved in `public` is a migration with downtime and real risk; doing it while BabyBlue is the only tenant costs a rename.

## 15. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| `search_path` leaking across pooled connections | **Critical** | `set local` only, inside a transaction, enforced in one wrapper (`withBrand`) with a test that asserts the `search_path` is reset after each transaction |
| Routing bug serves the wrong brand | High → **degraded to low** | Verified in §3: RLS denies regardless, so the failure is an empty result. Plus: unknown host = 404, never a fallback |
| `clone_schema` produces a subtly different schema | High | `verify_brand` asserts structure, RLS, forced RLS, policy bodies and function grants before `active`; CI diffs a provisioned schema against `bb_template` |
| Partial migration fan-out | Medium | Per-brand transactions, `brand_migrations` ledger, backward-compatible two-step migrations, `bb_template` first |
| Theme injection via `tenant_brands.theme` | Medium | `--bb-*` key allowlist and value sanitisation (§7) |
| Shared identity surprises a brand | Medium | Documented in §6 and in the operator agreement; `tenant_brands` not client-readable |
| Brand count outgrows one cluster | Medium | Enterprise tier (§12); connection and catalogue metrics watched from Tier 1 |
| Clinical phases outpace compliance | **Critical** | `clinical` / `claims` flags default off; each phase gated on written legal sign-off per brand |
| Promising deletion that Phase B forbids | High | Revise `patient_account_delete` and its UI copy *in the same phase* that introduces clinical records (§11 Phase B) |
| Verified badge diluted by brands | High | Verification stays platform-controlled (D-06); brands cannot set it |

## 16. Decisions to record

These belong in `DECISIONS.md` when the plan is accepted:

- A practice is the tenant of record; RLS continues to key on `practice_id`.
- A brand is a PostgreSQL schema; brands are tens, not thousands.
- Routing resolves host → schema via `tenant_brands`, applied with `set local` inside a transaction.
- Identity is shared across brands via Supabase `auth.users`; `profiles` lives in `public`.
- Reference data (`countries`, `provinces`, `cities`, `languages`, `specialities`, `council_bodies`, `procedure_codes`) is shared and read-only to clients.
- Brands are cloned from `bb_template` and must pass `verify_brand` before going active.
- `growth` and `directory` default off for new brands.
- Verification, audit logging, the consent model and the cancellation-window mechanic are not brand-configurable.
- Clinical data arrives in four gated phases, each with its own legal sign-off and feature flag.
- Enterprise isolation is preferably decided at provisioning, because shared identity makes later promotion user-visible.
