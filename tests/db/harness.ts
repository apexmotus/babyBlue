import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

/** Minimal stand-in for the Supabase pieces the schema depends on (auth schema, roles, auth.uid()). */
const SUPABASE_STUBS = `
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb not null default '{}');
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
`;

export async function freshDb() {
  const db = new PGlite({ extensions: { btree_gist, pgcrypto } });
  await db.exec(SUPABASE_STUBS);
  const dir = path.resolve(__dirname, "../../supabase/migrations");
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(path.join(dir, f), "utf8"));
  }
  return db;
}

export type Db = Awaited<ReturnType<typeof freshDb>>;

/** Run a query as a signed-in user (RLS applies), as anon, or as the superuser (null role). */
export async function run<T = Record<string, unknown>>(db: Db, who: string | "anon" | "admin-db", sql: string, params: unknown[] = []) {
  if (who === "admin-db") return (await db.query<T>(sql, params)).rows;
  if (who === "anon") await db.exec(`select set_config('request.jwt.claim.sub', '', false); set role anon;`);
  else await db.exec(`select set_config('request.jwt.claim.sub', '${who}', false); set role authenticated;`);
  try {
    return (await db.query<T>(sql, params)).rows;
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}

export const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

export const IDS = {
  ownerA: uuid(1),
  receptionA: uuid(2),
  ownerB: uuid(3),
  consumer1: uuid(4),
  consumer2: uuid(5),
  platformAdmin: uuid(6),
  operator: uuid(7),
  practiceA: uuid(101),
  practiceB: uuid(102),
  practitionerA: uuid(201),
  practitionerB: uuid(202),
  serviceA: uuid(301),
  serviceB: uuid(302),
  clientA: uuid(401),
  clientB: uuid(402),
};

/** A realistic two-practice world used by every test. Created as superuser (bypassing RLS). */
export async function seed(db: Db) {
  const I = IDS;
  await db.exec(`
    insert into auth.users (id, email) values
      ('${I.ownerA}', 'owner-a@example.test'), ('${I.receptionA}', 'reception-a@example.test'), ('${I.ownerB}', 'owner-b@example.test'),
      ('${I.consumer1}', 'c1@example.test'), ('${I.consumer2}', 'c2@example.test'),
      ('${I.platformAdmin}', 'admin@example.test'), ('${I.operator}', 'ops@example.test');
    insert into public.profiles (id, display_name, phone) values
      ('${I.consumer1}', 'Consumer One', '0820000001'), ('${I.consumer2}', 'Consumer Two', '0820000002')
      on conflict (id) do update set display_name = excluded.display_name, phone = excluded.phone;
    insert into public.platform_roles values ('${I.platformAdmin}', 'platform_admin'), ('${I.operator}', 'marketing_operator');

    insert into public.practices (id, name, slug, status) values
      ('${I.practiceA}', 'Practice A', 'practice-a', 'active'), ('${I.practiceB}', 'Practice B', 'practice-b', 'active');
    insert into public.practice_members values
      ('${I.practiceA}', '${I.ownerA}', 'practice_owner', now()), ('${I.practiceA}', '${I.receptionA}', 'receptionist', now()),
      ('${I.practiceB}', '${I.ownerB}', 'practice_owner', now());

    insert into public.practitioners (id, practice_id, display_name, speciality, listing_status) values
      ('${I.practitionerA}', '${I.practiceA}', 'Practitioner A', 'Physiotherapy', 'listed'),
      ('${I.practitionerB}', '${I.practiceB}', 'Practitioner B', 'Dietetics', 'listed');
    insert into public.services (id, practice_id, name, duration_min, buffer_min) values
      ('${I.serviceA}', '${I.practiceA}', 'Consultation', 30, 10), ('${I.serviceB}', '${I.practiceB}', 'Consultation', 45, 0);
    insert into public.practitioner_services values
      ('${I.practitionerA}', '${I.serviceA}', '${I.practiceA}'), ('${I.practitionerB}', '${I.serviceB}', '${I.practiceB}');
    insert into public.clients (id, practice_id, first_name, last_name, email) values
      ('${I.clientA}', '${I.practiceA}', 'Walk', 'In A', 'walkin-a@example.test'), ('${I.clientB}', '${I.practiceB}', 'Walk', 'In B', 'walkin-b@example.test');
  `);
  // Open every day 08:00–17:00 so tests never depend on which weekday they run.
  for (const pid of [I.practitionerA, I.practitionerB]) {
    const practice = pid === I.practitionerA ? I.practiceA : I.practiceB;
    for (let d = 0; d < 7; d++) {
      await db.exec(`insert into public.availability_rules (practice_id, practitioner_id, weekday, start_time, end_time) values ('${practice}', '${pid}', ${d}, '08:00', '17:00')`);
    }
  }
}

/** ISO date `n` days from today (UTC date is fine: slots are always searched across a 2-day window). */
export const dayPlus = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

export async function firstSlots(db: Db, who: string | "anon", practitioner: string, service: string, daysAhead = 3, count = 3) {
  const rows = await run<{ starts_at: string; ends_at: string }>(
    db,
    who,
    `select starts_at::text as starts_at, ends_at::text as ends_at from public.get_available_slots($1, $2, $3::date, $4::date) order by starts_at limit ${count}`,
    [practitioner, service, dayPlus(daysAhead), dayPlus(daysAhead + 1)],
  );
  return rows;
}
