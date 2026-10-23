import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Db, IDS as I, freshDb, run, seed } from "./harness";

let db: Db;
afterEach(async () => {
  await db.close();
});
beforeEach(async () => {
  db = await freshDb();
  await seed(db);
  await db.query("insert into public.marketing_services (id, slug, name, description) values ($1, 'profile', 'Profile optimisation', 'x')", [I.serviceA]);
});

describe("BabyBlue Flow: privacy-safe queue", () => {
  const join = (name: string, urgency = "routine") => run<{ token: string }>(db, "anon", "select public.join_queue('practice-a', $1, '0821112222', $2) as token", [name, urgency]);

  it("lets an anonymous patient join and see only status, place in line and practice name", async () => {
    const [{ token }] = await join("First Patient");
    const status = await run<Record<string, unknown>>(db, "anon", "select * from public.get_queue_status($1)", [token]);
    expect(Object.keys(status[0]).sort()).toEqual(["practice_name", "queue_position", "status"]);
    expect(status[0]).toMatchObject({ status: "waiting", queue_position: 1, practice_name: "Practice A" });
  });

  it("orders the queue and updates positions as people are seen", async () => {
    const [{ token: t1 }] = await join("One");
    const [{ token: t2 }] = await join("Two");
    const [{ token: t3 }] = await join("Three");
    const pos = async (t: string) => (await run<{ queue_position: number | null }>(db, "anon", "select queue_position from public.get_queue_status($1)", [t]))[0].queue_position;
    expect([await pos(t1), await pos(t2), await pos(t3)]).toEqual([1, 2, 3]);
    await run(db, I.receptionA, "update public.queue_entries set status = 'in_consultation', called_at = now() where public_token = $1", [t1]);
    expect([await pos(t1), await pos(t2), await pos(t3)]).toEqual([null, 1, 2]);
  });

  it("never exposes who else is in the queue or lets anonymous users read it", async () => {
    await join("Private Person");
    await expect(run(db, "anon", "select * from public.queue_entries")).rejects.toThrow(/permission denied/);
    expect(await run(db, "anon", "select * from public.get_queue_status('not-a-token')")).toHaveLength(0);
    expect(await run(db, I.ownerB, "select 1 from public.queue_entries")).toHaveLength(0);
    expect(await run(db, I.receptionA, "select 1 from public.queue_entries")).toHaveLength(1);
  });

  it("validates input and only accepts active practices", async () => {
    await expect(run(db, "anon", "select public.join_queue('practice-a', 'x')")).rejects.toThrow(/invalid_name/);
    await expect(run(db, "anon", "select public.join_queue('nope', 'Valid Name')")).rejects.toThrow(/practice_not_found/);
    await expect(run(db, "anon", "select public.join_queue('practice-a', 'Valid Name', null, 'panic')")).rejects.toThrow(/invalid_urgency/);
  });
});

describe("BabyBlue Growth: marketing requests", () => {
  async function draft() {
    const [r] = await run<{ id: string }>(
      db, I.ownerA,
      `insert into public.marketing_requests (practice_id, service_id, created_by, title, brief, budget_min_cents, budget_max_cents)
       values ($1, $2, $3, 'New profile photos', 'We would like refreshed photography.', 500000, 800000) returning id`,
      [I.practiceA, I.serviceA, I.ownerA],
    );
    return r.id;
  }
  const status = (id: string) => run<{ status: string }>(db, "admin-db", "select status::text from public.marketing_requests where id = $1", [id]).then((r) => r[0].status);

  it("lets only practice owners raise requests, and only as drafts", async () => {
    await expect(run(db, I.receptionA, "insert into public.marketing_requests (practice_id, service_id, created_by, title, brief) values ($1, $2, $3, 'Nope', 'no')", [I.practiceA, I.serviceA, I.receptionA])).rejects.toThrow(/row-level security/);
    await expect(run(db, I.ownerA, "insert into public.marketing_requests (practice_id, service_id, created_by, title, brief, status) values ($1, $2, $3, 'Skip ahead', 'x', 'approved')", [I.practiceA, I.serviceA, I.ownerA])).rejects.toThrow(/row-level security/);
    await expect(run(db, I.ownerB, "insert into public.marketing_requests (practice_id, service_id, created_by, title, brief) values ($1, $2, $3, 'Other practice', 'x')", [I.practiceA, I.serviceA, I.ownerB])).rejects.toThrow(/row-level security/);
    await expect(draft()).resolves.toBeTruthy();
  });

  it("rejects an inverted budget range", async () => {
    await expect(run(db, I.ownerA, "insert into public.marketing_requests (practice_id, service_id, created_by, title, brief, budget_min_cents, budget_max_cents) values ($1, $2, $3, 'Bad budget', 'x', 900, 100)", [I.practiceA, I.serviceA, I.ownerA])).rejects.toThrow(/check constraint/);
  });

  it("hides drafts from marketing operators and other practices until submitted", async () => {
    const id = await draft();
    expect(await run(db, I.operator, "select 1 from public.marketing_requests")).toHaveLength(0);
    expect(await run(db, I.ownerB, "select 1 from public.marketing_requests")).toHaveLength(0);
    await run(db, I.ownerA, "select public.marketing_set_status($1, 'submitted')", [id]);
    expect(await run(db, I.operator, "select 1 from public.marketing_requests")).toHaveLength(1);
    expect(await run(db, I.ownerB, "select 1 from public.marketing_requests")).toHaveLength(0);
  });

  it("walks the approval workflow and refuses shortcuts", async () => {
    const id = await draft();
    const set = (who: string, s: string) => run(db, who, "select public.marketing_set_status($1, $2::public.marketing_status)", [id, s]);
    await expect(set(I.ownerA, "approved")).rejects.toThrow(/invalid_transition/); // cannot approve own draft
    await set(I.ownerA, "submitted");
    await expect(set(I.ownerA, "closed")).rejects.toThrow(/invalid_transition/);
    await expect(set(I.ownerB, "in_review")).rejects.toThrow(/not_found/);
    await set(I.operator, "in_review");
    await set(I.operator, "proposal_sent");
    await expect(set(I.operator, "approved")).rejects.toThrow(/invalid_transition/); // only the practice approves a proposal
    await set(I.ownerA, "approved");
    await set(I.operator, "in_progress");
    expect(await status(id)).toBe("in_progress");
    const log = await run<{ action: string }>(db, I.ownerA, "select action from public.audit_log where entity = 'marketing_request'");
    expect(log.length).toBeGreaterThanOrEqual(5);
  });

  it("gives operators no access to clients, appointments, queues or availability", async () => {
    const id = await draft();
    await run(db, I.ownerA, "select public.marketing_set_status($1, 'submitted')", [id]);
    await db.query("insert into public.queue_entries (practice_id, display_name) values ($1, 'Someone')", [I.practiceA]);
    for (const table of ["clients", "appointments", "queue_entries", "availability_rules", "time_off", "practitioner_registrations", "audit_log"]) {
      const rows = await run(db, I.operator, `select 1 from public.${table}`);
      expect(rows, table).toHaveLength(0);
    }
  });

  it("restricts approvals to the owning practice and deliverables to operators", async () => {
    const id = await draft();
    await run(db, I.ownerA, "select public.marketing_set_status($1, 'submitted')", [id]);
    const [{ id: apprId }] = await run<{ id: string }>(db, I.operator, "insert into public.marketing_approvals (request_id, item) values ($1, 'Homepage design v1') returning id", [id]);
    await expect(run(db, I.ownerB, "select public.decide_approval($1, 'approved')", [apprId])).rejects.toThrow(/not_found/);
    await expect(run(db, I.operator, "select public.decide_approval($1, 'approved')", [apprId])).rejects.toThrow(/not_found/);
    await run(db, I.ownerA, "select public.decide_approval($1, 'changes_requested', 'Please use a warmer palette')", [apprId]);
    const [a] = await run<{ status: string; decided_by: string }>(db, "admin-db", "select status, decided_by from public.marketing_approvals where id = $1", [apprId]);
    expect(a).toEqual({ status: "changes_requested", decided_by: I.ownerA });

    await expect(run(db, I.ownerA, "insert into public.marketing_assets (request_id, uploaded_by, kind, file_name, storage_path) values ($1, $2, 'deliverable', 'fake.pdf', 'x')", [id, I.ownerA])).rejects.toThrow(/row-level security/);
    await expect(run(db, I.ownerA, "insert into public.marketing_assets (request_id, uploaded_by, kind, file_name, storage_path) values ($1, $2, 'brief_asset', 'logo.png', 'x')", [id, I.ownerA])).resolves.toHaveLength(0);
    await expect(run(db, I.operator, "insert into public.marketing_assets (request_id, uploaded_by, kind, file_name, storage_path) values ($1, $2, 'deliverable', 'design.pdf', 'x')", [id, I.operator])).resolves.toHaveLength(0);
  });
});
