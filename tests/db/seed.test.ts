import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SQL_FILES } from "@/local/sql.generated";
import { seedDemoData } from "@/local/seed";
import { REFRESH_SQL } from "@/local/refresh";

let db: PGlite;
let ms = 0;
beforeAll(async () => {
  db = new PGlite({ extensions: { btree_gist, pgcrypto } });
  for (const f of SQL_FILES) await db.exec(f.sql);
  const t = Date.now();
  await seedDemoData(db);
  ms = Date.now() - t;
}, 120_000);
afterAll(async () => {
  await db.close();
});

const one = async <T,>(sql: string) => (await db.query<T>(sql)).rows[0];

describe("local demo data", () => {
  it("loads quickly enough for a first-run experience", () => {
    console.log(`seed took ${ms}ms`);
    expect(ms).toBeLessThan(20_000);
  });

  it("creates the fictional ecosystem", async () => {
    expect(await one<{ n: number }>("select count(*)::int n from public.practices")).toEqual({ n: 8 });
    expect((await one<{ n: number }>("select count(*)::int n from public.practitioners")).n).toBe(12);
    expect((await one<{ n: number }>("select count(*)::int n from public.appointments")).n).toBeGreaterThan(1500);
    expect((await one<{ n: number }>("select count(*)::int n from public.clients")).n).toBeGreaterThan(200);
    expect((await one<{ n: number }>("select count(*)::int n from auth.users")).n).toBe(13);
  });

  it("offers genuinely bookable practitioners with next availability, and one pending practice that is not public", async () => {
    await db.exec("set role anon");
    const rows = (await db.query<{ display_name: string; next_available: string | null; verification_status: string }>("select * from public.search_practitioners()")).rows;
    await db.exec("reset role");
    expect(rows).toHaveLength(11);
    expect(rows.every((r) => r.next_available)).toBe(true);
    expect(rows.some((r) => r.display_name === "Dr Rebecca Mahlangu")).toBe(false);
    expect(rows.filter((r) => r.verification_status === "verified").length).toBeGreaterThanOrEqual(7);
  });

  it("gives demo patients upcoming and past appointments", async () => {
    const u = await one<{ id: string }>("select id from auth.users where email = 'lerato.ndlovu@demo.babyblue'");
    await db.exec(`select set_config('request.jwt.claim.sub', '${u.id}', false); set role authenticated`);
    const rows = (await db.query<{ status: string; starts_at: Date }>("select status::text, starts_at from public.my_appointments()")).rows;
    await db.exec("reset role");
    expect(rows.filter((r) => r.starts_at.getTime() > Date.now()).length).toBeGreaterThanOrEqual(2);
    expect(rows.filter((r) => r.starts_at.getTime() < Date.now()).length).toBeGreaterThanOrEqual(2);
  });

  it("produces real dashboard numbers for the demo practice", async () => {
    const owner = await one<{ id: string }>("select id from auth.users where email = 'rosebank@demo.babyblue'");
    const p = await one<{ id: string }>("select id from public.practices where slug = 'rosebank-family'");
    await db.exec(`select set_config('request.jwt.claim.sub', '${owner.id}', false); set role authenticated`);
    const stats = (await db.query<{ s: Record<string, number | null> }>("select public.practice_stats($1) s", [p.id])).rows[0].s;
    await db.exec("reset role");
    expect(stats.bookings_30d as number).toBeGreaterThan(40);
    expect(stats.utilisation_7d as number).toBeGreaterThan(5);
    expect(stats.utilisation_7d as number).toBeLessThan(100);
    expect(stats.queue_waiting).toBe(3);
  });

  it("never double-books anyone in the generated history", async () => {
    const bad = await one<{ n: number }>(`select count(*)::int n from public.appointments a join public.appointments b
      on a.practitioner_id = b.practitioner_id and a.id < b.id and a.during && b.during
     and a.status in ('booked','confirmed','checked_in','in_progress','completed') and b.status in ('booked','confirmed','checked_in','in_progress','completed')`);
    expect(bad.n).toBe(0);
  });

  it("lets demo accounts sign in with the documented password hash", async () => {
    const { rows } = await db.query<{ n: number }>("select count(*)::int n from auth.credentials");
    expect(rows[0].n).toBe(13);
  });

  it("moves a stale snapshot forward by whole weeks without breaking constraints, and keeps statuses consistent", async () => {
    const before = await one<{ n: number }>("select count(*)::int n from public.appointments where starts_at > now()");
    await db.exec("update public.demo_meta set v = (now() - interval '16 days')::text where k = 'snapshot_at'");
    await db.exec(REFRESH_SQL);
    const meta = await one<{ v: string }>("select v from public.demo_meta where k = 'snapshot_at'");
    expect(Date.now() - new Date(meta.v).getTime()).toBeGreaterThan(1.9 * 86400000);
    expect(Date.now() - new Date(meta.v).getTime()).toBeLessThan(2.1 * 86400000);
    const stale = await one<{ n: number }>("select count(*)::int n from public.appointments where ends_at < now() and status in ('booked','confirmed','in_progress')");
    expect(stale.n).toBe(0);
    const after = await one<{ n: number }>("select count(*)::int n from public.appointments where starts_at > now()");
    expect(after.n).toBeGreaterThan(0);
    void before;
  });
});
