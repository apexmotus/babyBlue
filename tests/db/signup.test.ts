import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Db, IDS as I, firstSlots, freshDb, run, seed, uuid } from "./harness";

let db: Db;
afterEach(async () => {
  await db.close();
});
beforeEach(async () => {
  db = await freshDb();
  await seed(db);
});

const newUser = (n: number, email: string, meta: Record<string, unknown>) =>
  db.query("insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3::jsonb)", [uuid(900 + n), email, JSON.stringify(meta)]);
const profile = async (n: number) => (await db.query<{ display_name: string; phone: string | null }>("select display_name, phone from public.profiles where id = $1", [uuid(900 + n)])).rows[0];

describe("public sign-up: a name, an email and a WhatsApp number, nothing sensitive", () => {
  it("stores the name and the WhatsApp number on the profile", async () => {
    await newUser(1, "thando@example.test", { display_name: "Thando Dube", phone: "+27824319087" });
    expect(await profile(1)).toEqual({ display_name: "Thando Dube", phone: "+27824319087" });
  });

  it("still works without a number (practice staff accounts are not the public)", async () => {
    await newUser(2, "staff@example.test", { display_name: "Reception" });
    expect((await profile(2)).phone).toBeNull();
  });

  it.each(["082 431 9087", "0824319087", "+0824319087", "+27 82 431 9087", "27824319087", "+2782431908712345678", "whatsapp me", "+27'; drop table profiles; --"])(
    "refuses %j: the database only keeps a number in international format",
    async (phone) => {
      await expect(newUser(3, "bad@example.test", { display_name: "Bad Number", phone })).rejects.toThrow(/profiles_phone_international|check constraint/i);
      expect(await profile(3)).toBeUndefined(); // the sign-up did not go through
    },
  );

  it("has no column anywhere on the profile for an ID number, passport or date of birth", async () => {
    const cols = (await db.query<{ column_name: string }>("select column_name from information_schema.columns where table_schema = 'public' and table_name = 'profiles'")).rows.map((r) => r.column_name);
    expect(cols.sort()).toEqual(["created_at", "display_name", "id", "phone"]);
  });

  it("refuses a bad number when a patient edits their profile too", async () => {
    await expect(run(db, I.consumer1, "update public.profiles set phone = '0820000001' where id = $1", [I.consumer1])).rejects.toThrow(/profiles_phone_international|check constraint/i);
    await run(db, I.consumer1, "update public.profiles set phone = '+27820000009' where id = $1", [I.consumer1]);
    expect((await run<{ phone: string }>(db, I.consumer1, "select phone from public.profiles where id = $1", [I.consumer1]))[0].phone).toBe("+27820000009");
  });
});

describe("a booking tells the practice it came from BabyBlue", () => {
  it("marks a patient's own booking as source 'app' and hands the practice their WhatsApp number", async () => {
    const [slot] = await firstSlots(db, "anon", I.practitionerA, I.serviceA, 3, 1);
    const [{ id: h }] = await run<{ id: string }>(db, I.consumer1, "select public.hold_slot($1, $2, $3::timestamptz) as id", [I.practitionerA, I.serviceA, slot.starts_at]);
    const [{ id }] = await run<{ id: string }>(db, I.consumer1, "select public.book_appointment($1) as id", [h]);

    // what the practice's own screens read (same shape as lib/os-data.ts loadBabyBlueBookings)
    const rows = await run<{ source: string; phone: string | null; client: string }>(
      db,
      I.ownerA,
      `select a.source, c.phone, trim(c.first_name || ' ' || c.last_name) client
         from public.appointments a join public.clients c on c.id = a.client_id where a.id = $1 and a.practice_id = $2 and a.source = 'app'`,
      [id, I.practiceA],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe("app");
    expect(rows[0].phone).toBe("+27820000001");
  });

  it("does not mark a booking the practice made itself as coming from BabyBlue", async () => {
    const [slot] = await firstSlots(db, "anon", I.practitionerA, I.serviceA, 3, 1);
    const [{ id }] = await run<{ id: string }>(db, I.ownerA, "select public.staff_create_appointment($1, $2, $3, $4::timestamptz) as id", [I.practitionerA, I.serviceA, I.clientA, slot.starts_at]);
    const [row] = await run<{ source: string }>(db, I.ownerA, "select source from public.appointments where id = $1", [id]);
    expect(row.source).toBe("os");
  });
});
