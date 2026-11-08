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

const hold = (who: string, starts: string) => run<{ id: string }>(db, who, "select public.hold_slot($1, $2, $3::timestamptz) as id", [I.practitionerA, I.serviceA, starts]);
const book = (who: string, holdId: string) => run<{ id: string }>(db, who, "select public.book_appointment($1) as id", [holdId]);

describe("availability", () => {
  it("offers slots stepped by duration + buffer, inside opening hours, to anonymous visitors", async () => {
    const slots = await firstSlots(db, "anon", I.practitionerA, I.serviceA, 3, 3);
    expect(slots).toHaveLength(3);
    const gaps = [1, 2].map((i) => (Date.parse(slots[i].starts_at) - Date.parse(slots[i - 1].starts_at)) / 60_000);
    expect(gaps).toEqual([40, 40]); // 30 min consultation + 10 min buffer
  });

  it("never offers slots for unlisted practitioners, inactive services or suspended practices", async () => {
    await db.exec(`update public.practitioners set listing_status = 'draft' where id = '${I.practitionerA}'`);
    expect(await firstSlots(db, "anon", I.practitionerA, I.serviceA)).toHaveLength(0);
    await db.exec(`update public.practitioners set listing_status = 'listed' where id = '${I.practitionerA}'; update public.services set active = false where id = '${I.serviceA}'`);
    expect(await firstSlots(db, "anon", I.practitionerA, I.serviceA)).toHaveLength(0);
    await db.exec(`update public.services set active = true where id = '${I.serviceA}'; update public.practices set status = 'suspended' where id = '${I.practiceA}'`);
    expect(await firstSlots(db, "anon", I.practitionerA, I.serviceA)).toHaveLength(0);
  });

  it("removes slots that overlap leave", async () => {
    const [first] = await firstSlots(db, "anon", I.practitionerA, I.serviceA, 3, 1);
    await db.query(`insert into public.time_off (practice_id, practitioner_id, during) values ($1, $2, tstzrange($3::timestamptz, $3::timestamptz + interval '1 hour'))`, [I.practiceA, I.practitionerA, first.starts_at]);
    const after = await firstSlots(db, "anon", I.practitionerA, I.serviceA, 3, 1);
    expect(Date.parse(after[0].starts_at)).toBeGreaterThan(Date.parse(first.starts_at));
  });

  it("respects minimum notice", async () => {
    const rows = await run<{ n: number }>(db, "anon", `select count(*)::int as n from public.get_available_slots($1, $2, current_date, current_date + 1) where starts_at < now() + interval '59 minutes'`, [I.practitionerA, I.serviceA]);
    expect(rows[0].n).toBe(0);
  });

  it("rejects absurd search ranges", async () => {
    await expect(run(db, "anon", `select * from public.get_available_slots($1, $2, current_date, current_date + 90)`, [I.practitionerA, I.serviceA])).rejects.toThrow(/invalid_range/);
  });
});

describe("booking and double-booking protection", () => {
  it("books a held slot, creates the client record and removes the slot from availability", async () => {
    const [slot] = await firstSlots(db, I.consumer1, I.practitionerA, I.serviceA);
    const [{ id: holdId }] = await hold(I.consumer1, slot.starts_at);
    const [{ id: apptId }] = await book(I.consumer1, holdId);
    expect(apptId).toBeTruthy();

    const [appt] = await run<{ status: string; source: string }>(db, I.consumer1, "select status::text, source from public.appointments where id = $1", [apptId]);
    expect(appt).toEqual({ status: "confirmed", source: "app" });
    const clients = await run<{ first_name: string; last_name: string }>(db, "admin-db", "select first_name, last_name from public.clients where user_id = $1", [I.consumer1]);
    expect(clients).toEqual([{ first_name: "Consumer", last_name: "One" }]);
    expect(await run(db, "admin-db", "select 1 from public.slot_holds")).toHaveLength(0);

    const left = await firstSlots(db, "anon", I.practitionerA, I.serviceA, 3, 50);
    expect(left.map((s) => Date.parse(s.starts_at))).not.toContain(Date.parse(slot.starts_at));
  });

  it("stops a second person taking a slot that is currently held", async () => {
    const [slot] = await firstSlots(db, I.consumer1, I.practitionerA, I.serviceA);
    await hold(I.consumer1, slot.starts_at);
    await expect(hold(I.consumer2, slot.starts_at)).rejects.toThrow(/slot_unavailable/);
  });

  it("stops a second booking of an already booked slot, and overlapping slots", async () => {
    const [slot, next] = await firstSlots(db, I.consumer1, I.practitionerA, I.serviceA);
    const [{ id: h1 }] = await hold(I.consumer1, slot.starts_at);
    await book(I.consumer1, h1);
    await expect(hold(I.consumer2, slot.starts_at)).rejects.toThrow(/slot_unavailable/);
    // An arbitrary overlapping time that was never offered is refused too.
    const overlapping = new Date(Date.parse(slot.starts_at) + 10 * 60_000).toISOString();
    await expect(hold(I.consumer2, overlapping)).rejects.toThrow(/slot_unavailable/);
    // The next genuine slot is still bookable.
    const [{ id: h2 }] = await hold(I.consumer2, next.starts_at);
    await expect(book(I.consumer2, h2)).resolves.toHaveLength(1);
  });

  it("enforces no overlap at the database level, even for writes that bypass the booking functions", async () => {
    const [slot] = await firstSlots(db, I.consumer1, I.practitionerA, I.serviceA);
    const [{ id: h }] = await hold(I.consumer1, slot.starts_at);
    await book(I.consumer1, h);
    await expect(
      db.query(
        `insert into public.appointments (practice_id, practitioner_id, service_id, client_id, starts_at, ends_at, during, status)
         values ($1, $2, $3, $4, $5::timestamptz + interval '5 minutes', $5::timestamptz + interval '20 minutes',
                 tstzrange($5::timestamptz + interval '5 minutes', $5::timestamptz + interval '20 minutes'), 'confirmed')`,
        [I.practiceA, I.practitionerA, I.serviceA, I.clientA, slot.starts_at],
      ),
    ).rejects.toThrow(/no_double_booking|conflicting key/);
  });

  it("lets staff book on behalf of a client, but never over an existing booking", async () => {
    const [slot] = await firstSlots(db, I.receptionA, I.practitionerA, I.serviceA);
    const call = () => run(db, I.receptionA, "select public.staff_create_appointment($1, $2, $3, $4::timestamptz, 'os') as id", [I.practitionerA, I.serviceA, I.clientA, slot.starts_at]);
    await expect(call()).resolves.toHaveLength(1);
    await expect(call()).rejects.toThrow(/slot_unavailable/);
  });

  it("refuses an expired hold, and then lets someone else have the slot", async () => {
    const [slot] = await firstSlots(db, I.consumer1, I.practitionerA, I.serviceA);
    const [{ id: h }] = await hold(I.consumer1, slot.starts_at);
    await db.exec(`update public.slot_holds set expires_at = now() - interval '1 minute'`);
    await expect(book(I.consumer1, h)).rejects.toThrow(/hold_expired/);
    const [{ id: h2 }] = await hold(I.consumer2, slot.starts_at);
    await expect(book(I.consumer2, h2)).resolves.toHaveLength(1);
  });

  it("requires authentication to hold or book", async () => {
    const [slot] = await firstSlots(db, "anon", I.practitionerA, I.serviceA);
    await expect(run(db, "anon", "select public.hold_slot($1, $2, $3::timestamptz)", [I.practitionerA, I.serviceA, slot.starts_at])).rejects.toThrow(/permission denied/);
  });

  it("does not let one person book with another person's hold", async () => {
    const [slot] = await firstSlots(db, I.consumer1, I.practitionerA, I.serviceA);
    const [{ id: h }] = await hold(I.consumer1, slot.starts_at);
    await expect(book(I.consumer2, h)).rejects.toThrow(/hold_expired/);
  });
});

describe("cancel and reschedule", () => {
  async function booked(daysAhead = 3) {
    const [slot, other] = await firstSlots(db, I.consumer1, I.practitionerA, I.serviceA, daysAhead, 2);
    const [{ id: h }] = await hold(I.consumer1, slot.starts_at);
    const [{ id }] = await book(I.consumer1, h);
    return { id, slot, other };
  }

  it("lets the consumer cancel outside the notice window and frees the slot for others", async () => {
    const { id, slot } = await booked();
    await run(db, I.consumer1, "select public.cancel_appointment($1, 'plans changed')", [id]);
    const [row] = await run<{ status: string }>(db, "admin-db", "select status::text from public.appointments where id = $1", [id]);
    expect(row.status).toBe("cancelled");
    const [{ id: h2 }] = await hold(I.consumer2, slot.starts_at);
    await expect(book(I.consumer2, h2)).resolves.toHaveLength(1);
  });

  it("blocks consumer cancellation inside the notice window, but not staff", async () => {
    await db.exec(`update public.practices set min_notice_minutes = 0`);
    const rows = await run<{ id: string }>(
      db, I.receptionA,
      "select public.staff_create_appointment($1, $2, $3, (now() + interval '2 hours')::timestamptz, 'os') as id",
      [I.practitionerA, I.serviceA, I.clientA],
    );
    await db.query("update public.appointments set consumer_id = $1 where id = $2", [I.consumer1, rows[0].id]);
    await expect(run(db, I.consumer1, "select public.cancel_appointment($1)", [rows[0].id])).rejects.toThrow(/too_late_to_cancel/);
    await expect(run(db, I.receptionA, "select public.cancel_appointment($1)", [rows[0].id])).resolves.toHaveLength(1);
  });

  it("hides other people's appointments from cancellation attempts", async () => {
    const { id } = await booked();
    await expect(run(db, I.consumer2, "select public.cancel_appointment($1)", [id])).rejects.toThrow(/not_found/);
    await expect(run(db, I.ownerB, "select public.cancel_appointment($1)", [id])).rejects.toThrow(/not_found/);
  });

  it("reschedules to an offered slot, and refuses busy or never-offered times", async () => {
    const { id, slot } = await booked();
    const later = await firstSlots(db, I.consumer1, I.practitionerA, I.serviceA, 4, 2);
    await run(db, I.consumer1, "select public.reschedule_appointment($1, $2::timestamptz)", [id, later[0].starts_at]);
    const [row] = await run<{ starts_at: string }>(db, "admin-db", "select starts_at::text from public.appointments where id = $1", [id]);
    expect(Date.parse(row.starts_at)).toBe(Date.parse(later[0].starts_at));

    // Someone else takes the original slot, so moving back must fail.
    const [{ id: h }] = await hold(I.consumer2, slot.starts_at);
    await book(I.consumer2, h);
    await expect(run(db, I.consumer1, "select public.reschedule_appointment($1, $2::timestamptz)", [id, slot.starts_at])).rejects.toThrow(/slot_unavailable/);
    // A time that is not on the practitioner's grid is never accepted from a consumer.
    const odd = new Date(Date.parse(later[1].starts_at) + 7 * 60_000).toISOString();
    await expect(run(db, I.consumer1, "select public.reschedule_appointment($1, $2::timestamptz)", [id, odd])).rejects.toThrow(/slot_unavailable/);
  });

  it("writes an audit trail that practice owners can read and nobody can edit", async () => {
    await booked();
    const rows = await run<{ action: string }>(db, I.ownerA, "select action from public.audit_log where practice_id = $1", [I.practiceA]);
    expect(rows.map((r) => r.action)).toContain("appointment.booked");
    await expect(run(db, I.ownerA, "delete from public.audit_log")).rejects.toThrow(/permission denied/);
    expect(await run(db, I.ownerB, "select 1 from public.audit_log where practice_id = $1", [I.practiceA])).toHaveLength(0);
  });
});
