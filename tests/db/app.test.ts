import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Db, IDS as I, firstSlots, freshDb, run, seed } from "./harness";

let db: Db;
afterEach(async () => {
  await db.close();
});
beforeEach(async () => {
  db = await freshDb();
  await seed(db);
  await db.exec(`insert into public.locations (practice_id, name, address, city) values ('${I.practiceA}', 'Main', '1 Test Road', 'Johannesburg'), ('${I.practiceB}', 'Main', '2 Test Road', 'Cape Town')`);
});

const holdAndBook = async (who: string, starts: string, practitioner = I.practitionerA, service = I.serviceA) => {
  const [{ id: h }] = await run<{ id: string }>(db, who, "select public.hold_slot($1, $2, $3::timestamptz) as id", [practitioner, service, starts]);
  const [{ id }] = await run<{ id: string }>(db, who, "select public.book_appointment($1) as id", [h]);
  return id;
};

describe("patient app", () => {
  it("creates a profile automatically when a user signs up", async () => {
    const [u] = await db.query<{ id: string }>("insert into auth.users (email, raw_user_meta_data) values ('new@example.test', '{\"display_name\":\"New Person\"}') returning id").then((r) => r.rows);
    const rows = await run<{ display_name: string }>(db, "admin-db", "select display_name from public.profiles where id = $1", [u.id]);
    expect(rows[0].display_name).toBe("New Person");
  });

  it("searches listed practitioners by name, speciality, service and city, with next availability and verification", async () => {
    await run(db, I.platformAdmin, "select public.set_verification($1, 'verified')", [I.practitionerB]);
    const all = await run<{ display_name: string; next_available: string | null; verification_status: string; city: string }>(db, "anon", "select * from public.search_practitioners()");
    expect(all).toHaveLength(2);
    expect(all.every((r) => r.next_available)).toBe(true);
    expect(all.find((r) => r.display_name === "Practitioner B")).toMatchObject({ verification_status: "verified", city: "Cape Town" });
    expect(await run(db, "anon", "select * from public.search_practitioners('physio')")).toHaveLength(1);
    expect(await run(db, "anon", "select * from public.search_practitioners(null, null, 'Cape Town')")).toHaveLength(1);
    expect(await run(db, "anon", "select * from public.search_practitioners(null, null, null, true)")).toHaveLength(1);
    expect(await run(db, "anon", "select * from public.search_practitioners('consultation')")).toHaveLength(2); // matches service name
    expect(await run(db, "anon", "select * from public.search_practitioners('zzz-nothing')")).toHaveLength(0);
  });

  it("hides unlisted practitioners and suspended practices from search", async () => {
    await db.exec(`update public.practitioners set listing_status = 'draft' where id = '${I.practitionerA}'; update public.practices set status = 'suspended' where id = '${I.practiceB}'`);
    expect(await run(db, "anon", "select * from public.search_practitioners()")).toHaveLength(0);
  });

  it("lists only my appointments, enriched, with cancellation eligibility", async () => {
    const [slot] = await firstSlots(db, I.consumer1, I.practitionerA, I.serviceA, 4, 1);
    const id = await holdAndBook(I.consumer1, slot.starts_at);
    const mine = await run<{ id: string; practitioner_name: string; address: string; can_cancel: boolean }>(db, I.consumer1, "select * from public.my_appointments()");
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ id, practitioner_name: "Practitioner A", address: "1 Test Road", can_cancel: true });
    expect(await run(db, I.consumer2, "select * from public.my_appointments()")).toHaveLength(0);
  });

  it("deletes an account, cancelling future bookings and keeping the practice's records anonymised", async () => {
    const [slot] = await firstSlots(db, I.consumer1, I.practitionerA, I.serviceA, 4, 1);
    const id = await holdAndBook(I.consumer1, slot.starts_at);
    await run(db, I.consumer1, "select public.delete_my_account()");
    expect(await run(db, "admin-db", "select 1 from auth.users where id = $1", [I.consumer1])).toHaveLength(0);
    const [a] = await run<{ status: string; consumer_id: string | null }>(db, "admin-db", "select status::text, consumer_id from public.appointments where id = $1", [id]);
    expect(a).toEqual({ status: "cancelled", consumer_id: null });
  });

  it("refuses to delete the sole owner of a practice", async () => {
    await expect(run(db, I.ownerB, "select public.delete_my_account()")).rejects.toThrow(/sole_owner/);
  });
});

describe("check-in, status and the queue", () => {
  async function today() {
    await db.exec(`update public.practices set min_notice_minutes = 0`);
    const rows = await run<{ id: string }>(db, I.receptionA, "select public.staff_create_appointment($1, $2, $3, (now() + interval '30 minutes')::timestamptz, 'os') as id", [I.practitionerA, I.serviceA, I.clientA]);
    await db.query("update public.appointments set consumer_id = $1 where id = $2", [I.consumer1, rows[0].id]);
    return rows[0].id;
  }

  it("lets a patient check in near their appointment, which also joins the reception queue", async () => {
    const id = await today();
    await run(db, I.consumer1, "select public.check_in_appointment($1)", [id]);
    const [a] = await run<{ status: string }>(db, "admin-db", "select status::text from public.appointments where id = $1", [id]);
    expect(a.status).toBe("checked_in");
    const q = await run<{ source: string; display_name: string }>(db, I.receptionA, "select source, display_name from public.queue_entries where appointment_id = $1", [id]);
    expect(q).toEqual([{ source: "booked", display_name: "Walk In A" }]);
  });

  it("refuses patient check-in far from the appointment time, and checking in twice", async () => {
    const [slot] = await firstSlots(db, I.consumer1, I.practitionerA, I.serviceA, 4, 1);
    const far = await holdAndBook(I.consumer1, slot.starts_at);
    await expect(run(db, I.consumer1, "select public.check_in_appointment($1)", [far])).rejects.toThrow(/too_early_to_check_in/);
    const id = await today();
    await run(db, I.consumer1, "select public.check_in_appointment($1)", [id]);
    await expect(run(db, I.consumer1, "select public.check_in_appointment($1)", [id])).rejects.toThrow(/not_checkin_able/);
    await expect(run(db, I.consumer2, "select public.check_in_appointment($1)", [id])).rejects.toThrow(/not_found/);
  });

  it("keeps appointment and queue statuses in step, and enforces valid transitions", async () => {
    const id = await today();
    await run(db, I.receptionA, "select public.set_appointment_status($1, 'checked_in')", [id]);
    await run(db, I.receptionA, "select public.set_appointment_status($1, 'in_progress')", [id]);
    expect((await run<{ status: string }>(db, "admin-db", "select status::text from public.queue_entries where appointment_id = $1", [id]))[0].status).toBe("in_consultation");
    await run(db, I.receptionA, "select public.set_appointment_status($1, 'completed')", [id]);
    expect((await run<{ status: string }>(db, "admin-db", "select status::text from public.queue_entries where appointment_id = $1", [id]))[0].status).toBe("done");
    await expect(run(db, I.receptionA, "select public.set_appointment_status($1, 'booked')", [id])).rejects.toThrow(/invalid_transition/);
    await expect(run(db, I.ownerB, "select public.set_appointment_status($1, 'completed')", [id])).rejects.toThrow(/not_found/);
  });

  it("runs the walk-in queue through the staff functions and the patient's private token", async () => {
    const [{ queue_add_walkin: token }] = await run<{ queue_add_walkin: string }>(db, I.receptionA, "select public.queue_add_walkin($1, 'Walk In Patient', '0830000000', 'soon')", [I.practiceA]);
    const [{ id }] = await run<{ id: string }>(db, I.receptionA, "select id from public.queue_entries where public_token = $1", [token]);
    await run(db, I.receptionA, "select public.queue_set_status($1, 'in_consultation')", [id]);
    await run(db, I.receptionA, "select public.queue_set_status($1, 'done')", [id]);
    await expect(run(db, I.receptionA, "select public.queue_set_status($1, 'waiting')", [id])).rejects.toThrow(/invalid_transition/);
    await expect(run(db, I.ownerB, "select public.queue_add_walkin($1, 'Nope')", [I.practiceA])).rejects.toThrow(/forbidden/);

    const [{ join_queue: t2 }] = await run<{ join_queue: string }>(db, "anon", "select public.join_queue('practice-a', 'Self Joiner')");
    await run(db, "anon", "select public.leave_queue($1)", [t2]);
    expect((await run<{ status: string }>(db, "anon", "select status::text from public.get_queue_status($1)", [t2]))[0].status).toBe("cancelled");
  });
});

describe("team and platform administration", () => {
  it("lets only owners add and remove staff by email, and never the last owner", async () => {
    await run(db, I.ownerA, "select public.add_practice_member_by_email($1, 'c1@example.test', 'staff')", [I.practiceA]);
    expect((await run<{ role: string }>(db, I.ownerA, "select role::text from public.practice_team($1) where email = 'c1@example.test'", [I.practiceA]))[0].role).toBe("staff");
    await expect(run(db, I.receptionA, "select public.add_practice_member_by_email($1, 'c2@example.test', 'staff')", [I.practiceA])).rejects.toThrow(/forbidden/);
    await expect(run(db, I.ownerA, "select public.add_practice_member_by_email($1, 'nobody@example.test', 'staff')", [I.practiceA])).rejects.toThrow(/user_not_found/);
    await expect(run(db, I.ownerA, "select public.remove_practice_member($1, $2)", [I.practiceA, I.ownerA])).rejects.toThrow(/sole_owner/);
    await run(db, I.ownerA, "select public.remove_practice_member($1, $2)", [I.practiceA, I.consumer1]);
    expect(await run(db, I.ownerB, "select * from public.practice_team($1)", [I.practiceA])).toHaveLength(0);
  });

  it("takes a practitioner from unverified to verified only through registration and platform admin review", async () => {
    await expect(run(db, I.receptionA, "select public.submit_verification($1, 'HPCSA', 'ZZ-123456')", [I.practitionerA])).rejects.toThrow(/forbidden/);
    await run(db, I.ownerA, "select public.submit_verification($1, 'HPCSA', 'ZZ-123456')", [I.practitionerA]);
    expect((await run<{ verification_status: string }>(db, "anon", "select verification_status from public.practitioners where id = $1", [I.practitionerA]))[0].verification_status).toBe("pending");
    const overview = await run<{ kind: string; detail: string; status: string }>(db, I.platformAdmin, "select kind, detail, status from public.admin_overview() where kind = 'practitioner' and status = 'pending'");
    expect(overview[0].detail).toBe("HPCSA ZZ-123456");
    expect(await run(db, I.ownerA, "select * from public.admin_overview()")).toHaveLength(0);
    await run(db, I.platformAdmin, "select public.set_verification($1, 'verified')", [I.practitionerA]);
    await expect(run(db, I.ownerB, "select public.submit_verification($1, 'HPCSA', 'ZZ-123456')", [I.practitionerB])).rejects.toThrow(/registration_in_use/);
  });

  it("lets platform admins grant roles and nobody else", async () => {
    await expect(run(db, I.ownerA, "select public.grant_platform_role('c1@example.test', 'marketing_operator')")).rejects.toThrow(/forbidden/);
    await run(db, I.platformAdmin, "select public.grant_platform_role('c1@example.test', 'marketing_operator')");
    expect((await run<{ r: string }>(db, I.consumer1, "select public.my_platform_role() as r"))[0].r).toBe("marketing_operator");
  });
});

describe("real dashboard numbers", () => {
  it("computes stats from actual appointments, with utilisation from real opening hours", async () => {
    await db.exec(`update public.practices set min_notice_minutes = 0`);
    const stats0 = (await run<{ practice_stats: Record<string, number | null> }>(db, I.ownerA, "select public.practice_stats($1)", [I.practiceA]))[0].practice_stats;
    expect(stats0.upcoming_7d).toBe(0);
    expect(stats0.utilisation_7d).toBe(0); // open 7 days × 9h, nothing booked
    expect(stats0.available_minutes_7d).toBe(7 * 9 * 60);

    const [s1, s2] = await firstSlots(db, I.consumer1, I.practitionerA, I.serviceA, 2, 2);
    const a = await holdAndBook(I.consumer1, s1.starts_at);
    await holdAndBook(I.consumer2, s2.starts_at);
    await run(db, I.receptionA, "select public.cancel_appointment($1)", [a]);
    const stats = (await run<{ practice_stats: Record<string, number | null> }>(db, I.ownerA, "select public.practice_stats($1)", [I.practiceA]))[0].practice_stats;
    expect(stats.upcoming_7d).toBe(1);
    expect(stats.booked_minutes_7d).toBe(30);
    expect(stats.utilisation_7d).toBeCloseTo((30 / (7 * 9 * 60)) * 100, 1);
    expect(stats.cancelled_30d).toBe(1);
    expect(stats.new_clients_30d).toBeGreaterThanOrEqual(2);
  });

  it("subtracts leave from available time", async () => {
    await db.query(`insert into public.time_off (practice_id, practitioner_id, during) values ($1, $2, tstzrange(now() - interval '1 day', now() + interval '8 days'))`, [I.practiceA, I.practitionerA]);
    const stats = (await run<{ practice_stats: Record<string, number | null> }>(db, I.ownerA, "select public.practice_stats($1)", [I.practiceA]))[0].practice_stats;
    expect(stats.available_minutes_7d).toBe(0);
    expect(stats.utilisation_7d).toBeNull(); // no capacity: no invented percentage
  });

  it("never shows one practice's numbers to another", async () => {
    await expect(run(db, I.ownerB, "select public.practice_stats($1)", [I.practiceA])).rejects.toThrow(/forbidden/);
    await expect(run(db, I.consumer1, "select public.practice_insights($1)", [I.practiceA])).rejects.toThrow(/forbidden/);
  });

  it("returns insight series with the expected shape", async () => {
    const out = (await run<{ practice_insights: Record<string, unknown> }>(db, I.ownerA, "select public.practice_insights($1, 6)", [I.practiceA]))[0].practice_insights;
    expect(Object.keys(out).sort()).toEqual(["by_practitioner", "by_source", "heatmap", "repeat", "revenue_est_cents", "weekly"]);
    expect((out.weekly as unknown[]).length).toBeGreaterThanOrEqual(6);
  });
});

describe("Growth inbox", () => {
  it("shows operators submitted requests with practice names, never drafts", async () => {
    await db.query("insert into public.marketing_services (id, slug, name, description) values ($1, 'p', 'Profile', 'x')", [I.serviceA]);
    const [{ id }] = await run<{ id: string }>(db, I.ownerA, "insert into public.marketing_requests (practice_id, service_id, created_by, title, brief) values ($1, $2, $3, 'Refresh', 'brief') returning id", [I.practiceA, I.serviceA, I.ownerA]);
    expect(await run(db, I.operator, "select * from public.marketing_inbox()")).toHaveLength(0);
    await run(db, I.ownerA, "select public.marketing_set_status($1, 'submitted')", [id]);
    const inbox = await run<{ practice_name: string; service_name: string }>(db, I.operator, "select * from public.marketing_inbox()");
    expect(inbox[0]).toMatchObject({ practice_name: "Practice A", service_name: "Profile" });
    expect(await run(db, I.ownerA, "select * from public.marketing_inbox()")).toHaveLength(0);
  });
});
