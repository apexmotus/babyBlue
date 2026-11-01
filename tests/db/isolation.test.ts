import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Db, IDS as I, firstSlots, freshDb, run, seed } from "./harness";

let db: Db;
afterEach(async () => {
  await db.close();
});
beforeEach(async () => {
  db = await freshDb();
  await seed(db);
});

describe("tenant isolation between practices", () => {
  it("shows an owner only their own practice's clients", async () => {
    expect((await run(db, I.ownerA, "select id from public.clients")).map((r) => (r as { id: string }).id)).toEqual([I.clientA]);
    expect((await run(db, I.ownerB, "select id from public.clients")).map((r) => (r as { id: string }).id)).toEqual([I.clientB]);
  });

  it("blocks writes into another practice", async () => {
    await expect(run(db, I.ownerB, "insert into public.clients (practice_id, first_name) values ($1, 'Intruder')", [I.practiceA])).rejects.toThrow(/row-level security/);
    await expect(run(db, I.ownerB, "insert into public.practice_members (practice_id, user_id, role) values ($1, $2, 'practice_owner')", [I.practiceA, I.ownerB])).rejects.toThrow(/row-level security/);
    const upd = await run(db, I.ownerB, "update public.practices set name = 'Hijacked' where id = $1 returning id", [I.practiceA]);
    expect(upd).toHaveLength(0);
    await expect(run(db, I.ownerB, "select public.staff_create_appointment($1, $2, $3, now() + interval '3 days', 'os')", [I.practitionerA, I.serviceA, I.clientA])).rejects.toThrow(/forbidden/);
  });

  it("keeps composite foreign keys honest: a practice cannot attach another practice's service", async () => {
    await expect(db.query("insert into public.practitioner_services values ($1, $2, $3)", [I.practitionerA, I.serviceB, I.practiceA])).rejects.toThrow(/foreign key/);
  });

  it("hides appointments and queue entries across practices", async () => {
    await run(db, I.receptionA, "select public.staff_create_appointment($1, $2, $3, now() + interval '3 days 10 hours', 'os')", [I.practitionerA, I.serviceA, I.clientA]);
    await db.query("insert into public.queue_entries (practice_id, display_name) values ($1, 'Someone')", [I.practiceA]);
    expect(await run(db, I.ownerA, "select 1 from public.appointments")).toHaveLength(1);
    expect(await run(db, I.ownerB, "select 1 from public.appointments")).toHaveLength(0);
    expect(await run(db, I.ownerB, "select 1 from public.queue_entries")).toHaveLength(0);
  });
});

describe("role boundaries inside a practice", () => {
  it("lets receptionists work the diary but not manage the practice or its team", async () => {
    expect(await run(db, I.receptionA, "select 1 from public.clients")).toHaveLength(1);
    expect(await run(db, I.receptionA, "update public.practices set name = 'Renamed' where id = $1 returning id", [I.practiceA])).toHaveLength(0);
    await expect(run(db, I.receptionA, "insert into public.practice_members (practice_id, user_id, role) values ($1, $2, 'practice_owner')", [I.practiceA, I.consumer1])).rejects.toThrow(/row-level security/);
    await expect(run(db, I.receptionA, "insert into public.services (practice_id, name, duration_min) values ($1, 'Free upgrade', 30)", [I.practiceA])).rejects.toThrow(/row-level security/);
  });

  it("cannot change the practice's status or slug even as owner (platform-only fields)", async () => {
    await expect(run(db, I.ownerA, "update public.practices set status = 'active', slug = 'x' where id = $1", [I.practiceA])).rejects.toThrow(/permission denied/);
  });

  it("only platform admins can activate a practice", async () => {
    const [created] = await run<{ id: string }>(db, I.consumer1, "select public.create_practice('New Clinic', 'new-clinic') as id");
    const [pending] = await run<{ status: string }>(db, "admin-db", "select status from public.practices where id = $1", [created.id]);
    expect(pending.status).toBe("pending");
    expect(await run(db, "anon", "select 1 from public.practices where id = $1", [created.id])).toHaveLength(0); // not public until active
    await expect(run(db, I.consumer1, "select public.activate_practice($1)", [created.id])).rejects.toThrow(/forbidden/);
    await run(db, I.platformAdmin, "select public.activate_practice($1)", [created.id]);
    expect(await run(db, "anon", "select 1 from public.practices where id = $1", [created.id])).toHaveLength(1);
  });
});

describe("consumers and anonymous visitors", () => {
  it("shows consumers only their own appointments", async () => {
    const [slot] = await firstSlots(db, I.consumer1, I.practitionerA, I.serviceA);
    const [{ id: h }] = await run<{ id: string }>(db, I.consumer1, "select public.hold_slot($1, $2, $3::timestamptz) as id", [I.practitionerA, I.serviceA, slot.starts_at]);
    await run(db, I.consumer1, "select public.book_appointment($1)", [h]);
    expect(await run(db, I.consumer1, "select 1 from public.appointments")).toHaveLength(1);
    expect(await run(db, I.consumer2, "select 1 from public.appointments")).toHaveLength(0);
    expect(await run(db, "anon", "select 1 from public.appointments").catch((e) => String(e))).toMatch(/permission denied/);
  });

  it("gives anonymous visitors discovery data only", async () => {
    expect(await run(db, "anon", "select 1 from public.practitioners")).toHaveLength(2);
    for (const table of ["clients", "appointments", "availability_rules", "time_off", "queue_entries", "leads", "audit_log", "practitioner_registrations", "marketing_requests"]) {
      await expect(run(db, "anon", `select 1 from public.${table}`), table).rejects.toThrow(/permission denied/);
    }
  });

  it("keeps leads and platform roles out of reach of every client role", async () => {
    for (const who of ["anon", I.consumer1, I.ownerA, I.platformAdmin] as const) {
      await expect(run(db, who, "select 1 from public.leads")).rejects.toThrow(/permission denied/);
      await expect(run(db, who, "insert into public.leads (kind, name, email, consent) values ('waitlist', 'x', 'x@x.co', true)")).rejects.toThrow(/permission denied/);
    }
    expect(await run(db, I.ownerA, "select 1 from public.platform_roles").catch((e) => String(e))).toMatch(/permission denied/);
  });
});

describe("verification badges", () => {
  it("never lets a practice verify itself", async () => {
    await expect(run(db, I.ownerA, "update public.practitioners set verification_status = 'verified', verified_at = now() where id = $1", [I.practitionerA])).rejects.toThrow(/verification_requires_platform_admin/);
    const [created] = await run<{ id: string }>(
      db, I.ownerA,
      `insert into public.practitioners (practice_id, display_name, speciality, verification_status, verified_at, listing_status)
       values ($1, 'Self-declared', 'GP', 'verified', now(), 'listed') returning id`, [I.practiceA],
    );
    const [row] = await run<{ verification_status: string; verified_at: string | null }>(db, "admin-db", "select verification_status, verified_at from public.practitioners where id = $1", [created.id]);
    expect(row).toEqual({ verification_status: "unverified", verified_at: null });
  });

  it("lets only platform admins verify, and records who and when", async () => {
    await expect(run(db, I.ownerA, "select public.set_verification($1, 'verified')", [I.practitionerA])).rejects.toThrow(/forbidden/);
    await run(db, I.platformAdmin, "select public.set_verification($1, 'verified')", [I.practitionerA]);
    const [row] = await run<{ verification_status: string; verified_by: string; has_time: boolean }>(
      db, "anon", "select verification_status, verified_by, verified_at is not null as has_time from public.practitioners where id = $1", [I.practitionerA],
    );
    expect(row).toEqual({ verification_status: "verified", verified_by: I.platformAdmin, has_time: true });
  });

  it("keeps registration numbers private", async () => {
    await db.query("insert into public.practitioner_registrations values ($1, 'HPCSA', 'XX-0000000')", [I.practitionerA]);
    await expect(run(db, "anon", "select * from public.practitioner_registrations")).rejects.toThrow(/permission denied/);
    expect(await run(db, I.consumer1, "select * from public.practitioner_registrations")).toHaveLength(0);
    expect(await run(db, I.ownerB, "select * from public.practitioner_registrations")).toHaveLength(0);
    expect(await run(db, I.ownerA, "select * from public.practitioner_registrations")).toHaveLength(1);
    expect(await run(db, I.platformAdmin, "select * from public.practitioner_registrations")).toHaveLength(1);
  });
});

describe("API login role (bb_api) and brand registry (0006)", () => {
  it("configures bb_api as noinherit, nobypassrls, with connection limit 85 and zero direct table grants", async () => {
    const [role] = await run<{
      rolinherit: boolean;
      rolbypassrls: boolean;
      rolconnlimit: number;
      can_anon: boolean;
      can_auth: boolean;
      can_service: boolean;
    }>(
      db,
      "admin-db",
      `select rolinherit,
              rolbypassrls,
              rolconnlimit,
              pg_has_role('bb_api', 'anon', 'member') as can_anon,
              pg_has_role('bb_api', 'authenticated', 'member') as can_auth,
              pg_has_role('bb_api', 'service_role', 'member') as can_service
         from pg_roles
        where rolname = 'bb_api'`,
    );
    expect(role).toEqual({
      rolinherit: false,
      rolbypassrls: false,
      rolconnlimit: 85,
      can_anon: true,
      can_auth: true,
      can_service: false,
    });

    // Without SET LOCAL ROLE, bb_api fails closed with 42501 when calling a public procedure:
    await db.exec("set role bb_api;");
    try {
      await expect(db.query("select * from public.public_city_list()")).rejects.toThrow(/permission denied/);
    } finally {
      await db.exec("reset role;");
    }
  });

  it("resolves verified brand domains via resolve_brand while denying direct table access", async () => {
    const [brand] = await run<{ slug: string; schema_name: string; status: string; features: Record<string, unknown> }>(
      db,
      "anon",
      "select slug, schema_name, status, features from public.resolve_brand('babyblue.co.za')",
    );
    expect(brand.slug).toBe("babyblue");
    expect(brand.schema_name).toBe("public");
    expect(brand.status).toBe("active");
    expect(brand.features.booking).toBe(true);
    expect(brand.features.growth).toBe(true);
    expect(brand.features.clinical).toBe(false);

    expect(await run(db, "anon", "select * from public.resolve_brand('unknown.example.com')")).toHaveLength(0);
    await expect(run(db, "anon", "select * from public.tenant_brands")).rejects.toThrow(/permission denied/);
    await expect(run(db, I.ownerA, "select * from public.tenant_brands")).rejects.toThrow(/permission denied/);
  });
});
