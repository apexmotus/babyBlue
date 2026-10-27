import type { PGlite } from "@electric-sql/pglite";
import { hashPassword, newSalt } from "./crypto.ts";

/**
 * FICTIONAL DEMO DATA for the local BabyBlue database. None of these people, practices or numbers are real.
 * Everything is generated deterministically so the demo looks the same on every machine.
 */
export const DEMO_PASSWORD = "demo1234";

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const uuid = () => crypto.randomUUID();

/* ───────────── people ───────────── */
const FIRST = ["Thabo", "Lerato", "Sipho", "Nomsa", "Ayesha", "Pieter", "Zanele", "Mandla", "Priya", "Johan", "Busisiwe", "Tshepo", "Fatima", "Kagiso", "Anele", "Naomi", "Daniel", "Megan", "Sibusiso", "Karabo", "Thandiwe", "Riaan", "Aisha", "Lwazi", "Elena", "Themba", "Nadia", "Ruan", "Palesa", "Kabelo", "Zodwa", "Yusuf", "Chantal", "Bongani", "Reshma", "Dumisani", "Hlengiwe", "Craig", "Nokuthula", "Imraan"];
const LAST = ["Dlamini", "Nkosi", "Khumalo", "Mokoena", "Naidoo", "Pretorius", "Botha", "Jacobs", "Mahlangu", "Sithole", "Molefe", "Patel", "van Wyk", "Zulu", "Ndlovu", "Venter", "Cele", "Radebe", "Moyo", "Adams", "Hendricks", "Ncube", "Maseko", "Smit", "du Toit", "Govender", "Mthembu", "Sebola", "Louw", "Tshabalala"];

interface DemoUser { key: string; email: string; name: string; phone?: string; id: string }
const mkUser = (key: string, name: string, phone?: string): DemoUser => ({ key, email: `${key}@demo.babyblue`, name, phone, id: uuid() });

const patients = [mkUser("lerato.ndlovu", "Lerato Ndlovu", "082 555 0142"), mkUser("mark.jacobs", "Mark Jacobs", "083 555 0187")];
const staffBusi = mkUser("busi", "Busi Radebe", "084 555 0111");
const ops = mkUser("ops", "Growth Operator", "011 555 0100");
const admin = mkUser("admin", "Platform Admin", "011 555 0101");

/* ───────────── practices ───────────── */
type Rule = { days: number[]; ranges: [string, string][] };
interface DemoSvc { name: string; description: string; mins: number; buffer: number; price: number }
interface DemoPractitioner { name: string; title: string; speciality: string; bio: string; languages: string[]; verified: boolean; pending?: boolean; reg?: [string, string]; rules: Rule[]; services: number[] }
interface DemoPractice {
  key: string; name: string; slug: string; status: "active" | "pending"; province: string; city: string; address: string; phone: string;
  ownerName: string; services: DemoSvc[]; practitioners: DemoPractitioner[]; minNotice: number; cancelHours: number; clients: number; volume: number;
}

const WK = [0, 1, 2, 3, 4];
const PRACTICES: DemoPractice[] = [
  {
    key: "rosebank", name: "Rosebank Family Practice", slug: "rosebank-family", status: "active", province: "Gauteng", city: "Johannesburg", address: "18 Cradock Avenue, Rosebank", phone: "011 555 0201",
    ownerName: "Dr Naledi Mokoena", minNotice: 60, cancelHours: 12, clients: 48, volume: 0.75,
    services: [
      { name: "Standard consultation", description: "A 20-minute consultation for a new or ongoing concern.", mins: 20, buffer: 5, price: 65000 },
      { name: "Extended consultation", description: "40 minutes for complex or multiple concerns.", mins: 40, buffer: 5, price: 95000 },
      { name: "Flu vaccination", description: "Seasonal flu vaccine, no consultation needed.", mins: 15, buffer: 0, price: 32000 },
      { name: "Repeat script review", description: "Quick review to renew chronic medication.", mins: 10, buffer: 0, price: 28000 },
    ],
    practitioners: [
      { name: "Dr Naledi Mokoena", title: "General Practitioner", speciality: "General practice", languages: ["English", "isiZulu", "Sesotho"], verified: true, reg: ["HPCSA", "MP0000101"], services: [0, 1, 2, 3],
        bio: "Family doctor with a focus on preventive care, chronic conditions and women's health. Believes in unhurried consultations and clear explanations.", rules: [{ days: WK, ranges: [["08:00", "13:00"], ["14:00", "17:00"]] }, { days: [5], ranges: [["08:00", "12:00"]] }] },
      { name: "Dr Andile Petersen", title: "General Practitioner", speciality: "General practice", languages: ["English", "Afrikaans"], verified: true, reg: ["HPCSA", "MP0000102"], services: [0, 1, 3],
        bio: "GP with a special interest in sports injuries, men's health and travel medicine. Consults in English and Afrikaans.", rules: [{ days: [1, 2, 3, 4], ranges: [["09:00", "13:00"], ["14:00", "18:00"]] }] },
    ],
  },
  {
    key: "parkview", name: "Parkview Dental Studio", slug: "parkview-dental", status: "active", province: "Gauteng", city: "Johannesburg", address: "42 Jan Smuts Avenue, Parkview", phone: "011 555 0202",
    ownerName: "Dr Sipho Dlamini", minNotice: 120, cancelHours: 24, clients: 40, volume: 0.65,
    services: [
      { name: "Check-up and clean", description: "Examination, scale and polish.", mins: 45, buffer: 5, price: 78000 },
      { name: "Filling", description: "Tooth-coloured filling, one surface.", mins: 60, buffer: 10, price: 115000 },
      { name: "Teeth whitening", description: "In-chair whitening session.", mins: 60, buffer: 10, price: 240000 },
      { name: "Emergency tooth pain", description: "Urgent assessment of dental pain.", mins: 30, buffer: 5, price: 69000 },
    ],
    practitioners: [
      { name: "Dr Sipho Dlamini", title: "Dentist", speciality: "Dentistry", languages: ["English", "isiZulu"], verified: true, reg: ["HPCSA", "DP0000201"], services: [0, 1, 3],
        bio: "General dentist focused on gentle, pain-free care for the whole family, with a calm approach for nervous patients.", rules: [{ days: WK, ranges: [["08:00", "13:00"], ["14:00", "17:00"]] }] },
      { name: "Dr Aisha Patel", title: "Dentist", speciality: "Dentistry", languages: ["English", "Gujarati"], verified: true, reg: ["HPCSA", "DP0000202"], services: [0, 1, 2],
        bio: "Cosmetic and restorative dentistry, including whitening and smile design.", rules: [{ days: [0, 2, 4], ranges: [["09:00", "16:00"]] }, { days: [5], ranges: [["08:00", "12:00"]] }] },
    ],
  },
  {
    key: "mindmotion", name: "Mind & Motion Physio", slug: "mind-and-motion", status: "active", province: "Western Cape", city: "Cape Town", address: "7 Regent Road, Sea Point", phone: "021 555 0203",
    ownerName: "Thandi Nkosi", minNotice: 60, cancelHours: 24, clients: 36, volume: 0.7,
    services: [
      { name: "Initial assessment", description: "Full assessment and treatment plan.", mins: 45, buffer: 5, price: 72000 },
      { name: "Follow-up treatment", description: "Hands-on treatment and exercise progression.", mins: 30, buffer: 5, price: 52000 },
      { name: "Sports massage", description: "Deep tissue massage for recovery.", mins: 60, buffer: 5, price: 65000 },
    ],
    practitioners: [
      { name: "Thandi Nkosi", title: "Physiotherapist", speciality: "Physiotherapy", languages: ["English", "isiXhosa"], verified: true, reg: ["HPCSA", "PT0000301"], services: [0, 1, 2],
        bio: "Physiotherapist treating back and neck pain, running injuries and post-surgical rehab. Hands-on treatment paired with practical exercise plans.", rules: [{ days: WK, ranges: [["07:00", "12:00"], ["13:00", "17:00"]] }] },
      { name: "Liam van der Merwe", title: "Physiotherapist", speciality: "Physiotherapy", languages: ["English", "Afrikaans"], verified: false, pending: true, reg: ["HPCSA", "PT0000302"], services: [0, 1],
        bio: "Sports physio working with cyclists and trail runners. Registration submitted and awaiting review.", rules: [{ days: [1, 3], ranges: [["10:00", "19:00"]] }, { days: [5], ranges: [["08:00", "13:00"]] }] },
    ],
  },
  {
    key: "clarity", name: "Clarity Counselling", slug: "clarity-counselling", status: "active", province: "Western Cape", city: "Cape Town", address: "22 Main Road, Newlands", phone: "021 555 0204",
    ownerName: "Dr Zanele Khumalo", minNotice: 180, cancelHours: 48, clients: 28, volume: 0.55,
    services: [
      { name: "Initial consultation", description: "A first session to understand what you're facing and agree how to work together.", mins: 60, buffer: 10, price: 120000 },
      { name: "Therapy session", description: "Individual therapy session.", mins: 50, buffer: 10, price: 105000 },
      { name: "Couples session", description: "Joint session for couples.", mins: 75, buffer: 15, price: 150000 },
    ],
    practitioners: [
      { name: "Dr Zanele Khumalo", title: "Clinical Psychologist", speciality: "Psychology", languages: ["English", "isiZulu"], verified: true, reg: ["HPCSA", "PS0000401"], services: [0, 1, 2],
        bio: "Clinical psychologist working with anxiety, burnout and relationship difficulties. Offers in-person and online sessions.", rules: [{ days: [0, 1, 2, 3], ranges: [["09:00", "13:00"], ["14:00", "18:00"]] }] },
      { name: "Ruth Adams", title: "Registered Counsellor", speciality: "Counselling", languages: ["English", "Afrikaans"], verified: false, reg: ["HPCSA", "RC0000402"], services: [0, 1],
        bio: "Registered counsellor supporting students and young adults through transitions and stress.", rules: [{ days: [1, 3, 4], ranges: [["12:00", "20:00"]] }] },
    ],
  },
  {
    key: "greenside", name: "Greenside Nutrition", slug: "greenside-nutrition", status: "active", province: "Gauteng", city: "Johannesburg", address: "9 Gleneagles Road, Greenside", phone: "011 555 0205",
    ownerName: "Palesa Molefe", minNotice: 60, cancelHours: 24, clients: 22, volume: 0.5,
    services: [
      { name: "Initial consultation", description: "Comprehensive review and personalised plan.", mins: 60, buffer: 5, price: 85000 },
      { name: "Follow-up consultation", description: "Progress review and plan adjustments.", mins: 30, buffer: 5, price: 48000 },
      { name: "Meal-plan review", description: "Quick check-in on your meal plan.", mins: 20, buffer: 0, price: 30000 },
    ],
    practitioners: [
      { name: "Palesa Molefe", title: "Registered Dietitian", speciality: "Dietetics", languages: ["English", "Sesotho", "Setswana"], verified: true, reg: ["HPCSA", "DT0000501"], services: [0, 1, 2],
        bio: "Dietitian helping people manage diabetes, gut health and weight sustainably, without fads.", rules: [{ days: [0, 1, 3, 4], ranges: [["08:30", "16:30"]] }] },
    ],
  },
  {
    key: "umhlanga", name: "Umhlanga Eye Care", slug: "umhlanga-eye-care", status: "active", province: "KwaZulu-Natal", city: "Durban", address: "5 Lagoon Drive, Umhlanga", phone: "031 555 0206",
    ownerName: "Dr Kavita Naidoo", minNotice: 60, cancelHours: 24, clients: 26, volume: 0.55,
    services: [
      { name: "Comprehensive eye test", description: "Full vision and eye-health examination.", mins: 30, buffer: 5, price: 48000 },
      { name: "Contact lens fitting", description: "Fitting and training for new contact lens wearers.", mins: 45, buffer: 5, price: 65000 },
    ],
    practitioners: [
      { name: "Dr Kavita Naidoo", title: "Optometrist", speciality: "Optometry", languages: ["English", "Tamil", "isiZulu"], verified: true, reg: ["HPCSA", "OP0000601"], services: [0, 1],
        bio: "Optometrist with a focus on children's vision, dry eye and contact lens fitting.", rules: [{ days: WK, ranges: [["08:30", "13:00"], ["14:00", "17:30"]] }, { days: [5], ranges: [["09:00", "13:00"]] }] },
    ],
  },
  {
    key: "hatfield", name: "Hatfield Wellness Chiropractic", slug: "hatfield-chiropractic", status: "active", province: "Gauteng", city: "Pretoria", address: "310 Burnett Street, Hatfield", phone: "012 555 0207",
    ownerName: "Dr Pieter Venter", minNotice: 60, cancelHours: 24, clients: 20, volume: 0.5,
    services: [
      { name: "Initial consultation and adjustment", description: "Assessment and first treatment.", mins: 45, buffer: 5, price: 70000 },
      { name: "Adjustment", description: "Follow-up spinal adjustment.", mins: 20, buffer: 5, price: 45000 },
    ],
    practitioners: [
      { name: "Dr Pieter Venter", title: "Chiropractor", speciality: "Chiropractic", languages: ["English", "Afrikaans"], verified: false, services: [0, 1],
        bio: "Chiropractor treating back pain, headaches and posture problems.", rules: [{ days: [0, 1, 2, 3], ranges: [["08:00", "12:00"], ["13:00", "17:00"]] }] },
    ],
  },
  {
    key: "sandton", name: "Sandton Specialist Rooms", slug: "sandton-specialist-rooms", status: "pending", province: "Gauteng", city: "Johannesburg", address: "Rivonia Road, Sandton", phone: "011 555 0208",
    ownerName: "Dr Rebecca Mahlangu", minNotice: 120, cancelHours: 48, clients: 0, volume: 0,
    services: [{ name: "Skin consultation", description: "Assessment of skin, hair and nail concerns.", mins: 30, buffer: 10, price: 135000 }],
    practitioners: [
      { name: "Dr Rebecca Mahlangu", title: "Dermatologist", speciality: "Dermatology", languages: ["English", "Sepedi"], verified: false, reg: ["HPCSA", "MP0000801"], services: [0],
        bio: "Dermatologist treating acne, eczema and skin cancer screening. New to BabyBlue; awaiting activation.", rules: [{ days: [1, 2, 3], ranges: [["09:00", "16:00"]] }] },
    ],
  },
];

/**
 * Which (speciality, city) pairs the public directory lists: practitioners at active practices.
 * This is the static twin of `search_practitioners`, used to generate the public listing routes at build time
 * (the database itself only exists in the browser). tests/db/seed.test.ts keeps the two in step.
 */
export function demoListedFacets(): { speciality: string; city: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const P of PRACTICES) {
    if (P.status !== "active") continue;
    for (const pr of P.practitioners) {
      const k = `${pr.speciality}\u0000${P.city}`;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
  }
  return [...counts]
    .map(([k, count]) => {
      const [speciality, city] = k.split("\u0000");
      return { speciality, city, count };
    })
    .sort((a, b) => a.speciality.localeCompare(b.speciality) || a.city.localeCompare(b.city));
}

const MARKETING = [
  ["profile-optimisation", "Professional profile optimisation", "A clear, accurate, well-presented BabyBlue profile: services, specialities, languages, photography and approachable copy."],
  ["practice-website", "Practice website design", "A fast, accessible website that reflects your practice and connects to your BabyBlue diary."],
  ["brand-identity", "Brand identity & design", "Logo, colours, typography and templates that feel like your practice."],
  ["photography", "Photography & content creation", "Authentic photography of you, your team and your space, plus content you can use."],
  ["search-visibility", "Search visibility", "Accurate local listings and well-structured pages so people can find you."],
  ["compliant-campaigns", "Compliant advertising campaigns", "Paid campaigns built to your regulator's advertising rules, never using patient data."],
  ["strategy", "Marketing strategy", "A practical plan that fits your practice, budget and goals."],
  ["reporting", "Campaign reporting", "Plain-language reports on what was done, what it cost and what happened."],
] as const;

/* ───────────── time helpers (South Africa is UTC+2 all year) ───────────── */
const DAY = 86400000;
function zaToday(): Date {
  const z = new Date(Date.now() + 2 * 3600_000);
  return new Date(Date.UTC(z.getUTCFullYear(), z.getUTCMonth(), z.getUTCDate()));
}
const isoDate = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY);
const weekday = (d: Date) => (d.getUTCDay() + 6) % 7;
const zaTs = (d: Date, hhmm: string) => new Date(`${isoDate(d)}T${hhmm}:00+02:00`);
const mins = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

export async function seedDemoData(db: PGlite) {
  const rand = rng(20261023);
  const pick = <T,>(a: readonly T[]) => a[Math.floor(rand() * a.length)];
  const salt = newSalt();
  const hash = await hashPassword(DEMO_PASSWORD, salt);
  const today = zaToday();
  const now = Date.now();

  /* users */
  const ownerUsers = PRACTICES.map((p) => mkUser(p.key, p.ownerName, "082 555 01" + String(10 + Math.floor(rand() * 80))));
  const allUsers = [...patients, staffBusi, ops, admin, ...ownerUsers];
  for (const u of allUsers) {
    await db.query("insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3::jsonb)", [u.id, u.email, JSON.stringify({ display_name: u.name })]);
    await db.query("insert into auth.credentials (user_id, salt, hash) values ($1, $2, $3)", [u.id, salt, hash]);
    if (u.phone) await db.query("update public.profiles set phone = $2 where id = $1", [u.id, u.phone]);
  }
  await db.query("insert into public.platform_roles values ($1, 'platform_admin'), ($2, 'marketing_operator')", [admin.id, ops.id]);

  /* practices and everything inside them */
  const clientPools: Record<string, { id: string; userId?: string }[]> = {};
  const apptRows: Record<string, unknown[]> = {
    id: [], practice_id: [], practitioner_id: [], service_id: [], client_id: [], consumer_id: [], starts_at: [], ends_at: [], buffer_min: [], during_end: [], status: [], source: [], created_at: [], cancelled_at: [],
  };
  const patientTargets: { practiceKey: string; userId: string; clientId: string }[] = [];
  const practiceIds: Record<string, string> = {};
  const practitionerIds: Record<string, string> = {};

  for (let pi = 0; pi < PRACTICES.length; pi++) {
    const P = PRACTICES[pi];
    const owner = ownerUsers[pi];
    const practiceId = uuid();
    practiceIds[P.key] = practiceId;
    await db.query("insert into public.practices (id, name, slug, status, province, min_notice_minutes, cancellation_notice_hours, created_at) values ($1, $2, $3, $4, $5, $6, $7, now() - interval '120 days')",
      [practiceId, P.name, P.slug, P.status, P.province, P.minNotice, P.cancelHours]);
    await db.query("insert into public.locations (practice_id, name, address, city, province) values ($1, 'Main rooms', $2, $3, $4)", [practiceId, P.address, P.city, P.province]);
    await db.query("insert into public.practice_members (practice_id, user_id, role) values ($1, $2, 'practice_owner')", [practiceId, owner.id]);
    if (P.key === "rosebank") await db.query("insert into public.practice_members (practice_id, user_id, role) values ($1, $2, 'receptionist')", [practiceId, staffBusi.id]);

    const serviceIds = [] as string[];
    for (const s of P.services) {
      const id = uuid();
      serviceIds.push(id);
      await db.query("insert into public.services (id, practice_id, name, description, duration_min, buffer_min, price_cents) values ($1, $2, $3, $4, $5, $6, $7)", [id, practiceId, s.name, s.description, s.mins, s.buffer, s.price]);
    }

    /* clients */
    const pool: { id: string; userId?: string }[] = [];
    const used = new Set<string>();
    for (let c = 0; c < P.clients; c++) {
      let name = `${pick(FIRST)} ${pick(LAST)}`;
      while (used.has(name)) name = `${pick(FIRST)} ${pick(LAST)}`;
      used.add(name);
      const [first, ...rest] = name.split(" ");
      const id = uuid();
      pool.push({ id });
      await db.query("insert into public.clients (id, practice_id, first_name, last_name, email, phone, consent_record_storage, consent_at, created_at) values ($1, $2, $3, $4, $5, $6, $7, $8, now() - make_interval(days => $9))",
        [id, practiceId, first, rest.join(" "), `${first}.${rest.join("")}`.toLowerCase().replace(/\s/g, "") + "@example.test", `08${2 + Math.floor(rand() * 4)} 555 0${String(100 + Math.floor(rand() * 899))}`, rand() > 0.25, rand() > 0.25 ? new Date(now - rand() * 90 * DAY) : null, Math.floor(rand() * 150) + 1]);
    }
    // Link demo patient accounts as clients where they "visit".
    const links: [number, DemoUser][] = P.key === "rosebank" ? [[0, patients[0]], [1, patients[1]]] : P.key === "parkview" ? [[0, patients[0]]] : P.key === "mindmotion" ? [[0, patients[0]]] : P.key === "greenside" ? [[0, patients[1]]] : [];
    for (const [idx, u] of links) {
      const [first, ...rest] = u.name.split(" ");
      const id = uuid();
      pool.push({ id, userId: u.id });
      await db.query("insert into public.clients (id, practice_id, user_id, first_name, last_name, email, phone, consent_record_storage, consent_at, created_at) values ($1, $2, $3, $4, $5, $6, $7, true, now() - interval '40 days', now() - interval '70 days')",
        [id, practiceId, u.id, first, rest.join(" "), u.email, u.phone]);
      patientTargets.push({ practiceKey: P.key, userId: u.id, clientId: id });
      void idx;
    }
    clientPools[P.key] = pool;

    /* practitioners */
    for (const pr of P.practitioners) {
      const id = uuid();
      practitionerIds[`${P.key}:${pr.name}`] = id;
      const linkedUser = pr.name === P.ownerName ? owner.id : null;
      await db.query("insert into public.practitioners (id, practice_id, user_id, display_name, title, speciality, bio, languages, listing_status) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
        [id, practiceId, linkedUser, pr.name, pr.title, pr.speciality, pr.bio, pr.languages, P.status === "active" ? "listed" : "draft"]);
      if (pr.reg) await db.query("insert into public.practitioner_registrations (practitioner_id, body, registration_number) values ($1, $2, $3)", [id, pr.reg[0], pr.reg[1]]);
      if (pr.verified) await db.query("update public.practitioners set verification_status = 'verified', verified_at = now() - interval '60 days', verified_by = $2 where id = $1", [id, admin.id]);
      else if (pr.pending) await db.query("update public.practitioners set verification_status = 'pending' where id = $1", [id]);
      else if (P.key === "sandton") await db.query("update public.practitioners set verification_status = 'pending' where id = $1", [id]);
      for (const si of pr.services) await db.query("insert into public.practitioner_services values ($1, $2, $3)", [id, serviceIds[si], practiceId]);
      for (const r of pr.rules) for (const d of r.days) for (const [a, b] of r.ranges)
        await db.query("insert into public.availability_rules (practice_id, practitioner_id, weekday, start_time, end_time) values ($1, $2, $3, $4, $5)", [practiceId, id, d, a, b]);

      /* appointment history + near future (generated in order, never overlapping) */
      if (P.status !== "active") continue;
      for (let off = -60; off <= 14; off++) {
        const day = addDays(today, off);
        const wd = weekday(day);
        const ranges = pr.rules.filter((r) => r.days.includes(wd)).flatMap((r) => r.ranges);
        if (!ranges.length) continue;
        const fill = off < 0 ? 0.55 + P.volume * 0.25 : off === 0 ? 0.7 : Math.max(0.12, 0.5 - off * 0.025);
        for (const [a, b] of ranges) {
          let t = mins(a);
          while (t < mins(b)) {
            const si = pr.services[Math.floor(rand() * pr.services.length)];
            const svc = P.services[si];
            if (t + svc.mins > mins(b)) break;
            if (rand() < fill * P.volume + 0.1) {
              const start = zaTs(day, hhmm(t));
              const end = new Date(start.getTime() + svc.mins * 60_000);
              const client = pick(pool);
              let status: string;
              const r = rand();
              if (end.getTime() < now) status = r < 0.8 ? "completed" : r < 0.91 ? "cancelled" : "no_show";
              else if (start.getTime() <= now) status = "in_progress";
              else status = r < 0.94 ? "confirmed" : "cancelled";
              if (status === "confirmed" && start.getTime() - now < 3 * 3600_000 && rand() < 0.35) status = "checked_in";
              const src = client.userId ? "app" : rand() < 0.55 ? "app" : rand() < 0.7 ? "os" : "flow";
              const created = new Date(Math.min(now - 60_000, start.getTime() - (src === "os" ? rand() * 2 : 1 + rand() * 13) * DAY));
              const rows = apptRows;
              rows.id.push(uuid()); rows.practice_id.push(practiceId); rows.practitioner_id.push(id); rows.service_id.push(serviceIds[si]); rows.client_id.push(client.id);
              rows.consumer_id.push(client.userId ?? null); rows.starts_at.push(start.toISOString()); rows.ends_at.push(end.toISOString()); rows.buffer_min.push(svc.buffer);
              rows.during_end.push(new Date(end.getTime() + svc.buffer * 60_000).toISOString()); rows.status.push(status); rows.source.push(src);
              rows.created_at.push(created.toISOString()); rows.cancelled_at.push(status === "cancelled" ? new Date(Math.min(now, start.getTime() - rand() * 3 * DAY)).toISOString() : null);
            }
            t += svc.mins + svc.buffer + (rand() < 0.3 ? 5 : 0);
          }
        }
      }
    }
  }

  /* guarantee the demo patients have a healthy mix of upcoming and past visits */
  for (const tgt of patientTargets) {
    const idxs = apptRows.id.map((_, i) => i).filter((i) => apptRows.practice_id[i] === practiceIds[tgt.practiceKey] && apptRows.consumer_id[i] === null);
    const future = idxs.filter((i) => Date.parse(apptRows.starts_at[i] as string) > now + DAY && apptRows.status[i] === "confirmed").slice(0, 2);
    const past = idxs.filter((i) => Date.parse(apptRows.starts_at[i] as string) < now - 3 * DAY && apptRows.status[i] === "completed").slice(0, 3);
    for (const i of [...future, ...past]) { apptRows.client_id[i] = tgt.clientId; apptRows.consumer_id[i] = tgt.userId; apptRows.source[i] = "app"; }
  }

  const A = apptRows;
  const chunk = 600;
  for (let off = 0; off < A.id.length; off += chunk) {
    const sl = (k: string) => (A[k] as unknown[]).slice(off, off + chunk);
    await db.query(
      `insert into public.appointments (id, practice_id, practitioner_id, service_id, client_id, consumer_id, starts_at, ends_at, buffer_min, during, status, source, created_at, cancelled_at)
       select t.id, t.pr, t.pt, t.sv, t.cl, t.co, t.s, t.e, t.b, tstzrange(t.s, t.de), t.st::public.appointment_status, t.src, t.ca, t.cx
         from unnest($1::uuid[], $2::uuid[], $3::uuid[], $4::uuid[], $5::uuid[], $6::uuid[], $7::timestamptz[], $8::timestamptz[], $9::int[], $10::timestamptz[], $11::text[], $12::text[], $13::timestamptz[], $14::timestamptz[])
              as t(id, pr, pt, sv, cl, co, s, e, b, de, st, src, ca, cx)`,
      [sl("id"), sl("practice_id"), sl("practitioner_id"), sl("service_id"), sl("client_id"), sl("consumer_id"), sl("starts_at"), sl("ends_at"), sl("buffer_min"), sl("during_end"), sl("status"), sl("source"), sl("created_at"), sl("cancelled_at")],
    );
  }

  /* Flow: a live queue at Rosebank today */
  const rb = practiceIds["rosebank"];
  const qNames: [string, string, string, number][] = [["Anele Maseko", "done", "routine", 95], ["Zodwa Cele", "done", "routine", 70], ["Imraan Patel", "in_consultation", "soon", 40], ["Karabo Sebola", "waiting", "routine", 28], ["Craig Louw", "waiting", "urgent", 15], ["Nokuthula Zulu", "waiting", "routine", 6]];
  for (const [name, st, urg, ago] of qNames) {
    await db.query("insert into public.queue_entries (practice_id, display_name, phone, status, urgency, source, joined_at, called_at, completed_at) values ($1, $2, '082 555 0150', $3::public.queue_status, $4, 'qr', now() - make_interval(mins => $5), case when $3 <> 'waiting' then now() - make_interval(mins => $5 - 10) end, case when $3 = 'done' then now() - make_interval(mins => $5 - 25) end)", [rb, name, st, urg, ago]);
  }

  /* Growth */
  const catalogue: Record<string, string> = {};
  for (const [slug, name, description] of MARKETING) {
    const id = uuid();
    catalogue[slug] = id;
    await db.query("insert into public.marketing_services (id, slug, name, description) values ($1, $2, $3, $4)", [id, slug, name, description]);
  }
  const rbOwner = ownerUsers[0].id;
  const mkReq = async (practice: string, owner: string, service: string, title: string, brief: string, status: string, min: number | null, max: number | null, days: number) => {
    const id = uuid();
    await db.query("insert into public.marketing_requests (id, practice_id, service_id, created_by, title, brief, budget_min_cents, budget_max_cents, deadline, status, assigned_to, created_at, updated_at) values ($1, $2, $3, $4, $5, $6, $7, $8, current_date + 21, $9::public.marketing_status, $10, now() - make_interval(days => $11), now() - make_interval(days => $11 - 1))",
      [id, practice, catalogue[service], owner, title, brief, min, max, status, status === "draft" || status === "submitted" ? null : ops.id, days]);
    return id;
  };
  const r1 = await mkReq(rb, rbOwner, "photography", "Refresh our practice and team photography", "We'd like natural, welcoming photos of our two doctors, reception and consulting rooms for our BabyBlue profile and website. Warm, not stock-photo-ish.", "in_progress", 600000, 900000, 12);
  const r2 = await mkReq(rb, rbOwner, "practice-website", "A simple practice website", "A clean 5-page website: home, doctors, services, contact and booking. Must link to our BabyBlue diary.", "proposal_sent", 1500000, 2500000, 6);
  const r3 = await mkReq(rb, rbOwner, "search-visibility", "Fix our local search listings", "Our opening hours are wrong on a couple of directories and we don't appear for 'GP Rosebank'.", "delivered", 300000, 500000, 30);
  await mkReq(practiceIds["parkview"], ownerUsers[1].id, "compliant-campaigns", "Teeth-whitening campaign", "Compliant campaign for our whitening service, targeting Johannesburg north. No before/after claims.", "submitted", 800000, 1200000, 2);
  await mkReq(practiceIds["mindmotion"], ownerUsers[2].id, "profile-optimisation", "Profile rewrite", "Please make our profile clearer and add accurate services.", "draft", null, null, 1);
  const upd = (req: string, author: string, body: string, ago: number) => db.query("insert into public.campaign_updates (request_id, author_id, body, created_at) values ($1, $2, $3, now() - make_interval(days => $4))", [req, author, body, ago]);
  await upd(r1, ops.id, "Thanks for the brief. We've shortlisted two photographers based in Johannesburg and will share portfolios for your approval.", 10);
  await upd(r1, rbOwner, "Lovely, we prefer the second portfolio.", 9);
  await upd(r1, ops.id, "Shoot booked for next Tuesday, 08:00 before clinic opens. Please confirm doctors' availability.", 5);
  await db.query("insert into public.marketing_approvals (request_id, item, status, comment, decided_by, decided_at) values ($1, 'Photographer shortlist', 'approved', 'Second portfolio please.', $2, now() - interval '9 days')", [r1, rbOwner]);
  await db.query("insert into public.marketing_approvals (request_id, item, status) values ($1, 'Shot list and locations', 'pending')", [r1]);
  await upd(r2, ops.id, "Proposal sent: 5 pages, booking integration, 3-week delivery.", 4);
  await upd(r3, ops.id, "Listings corrected on 6 directories and Google Business Profile verified.", 5);
  await db.query("insert into public.campaign_reports (request_id, period, summary, metrics, created_by) values ($1, 'Last 30 days', 'Listings are now accurate across six directories. Profile views from search have started to increase.', $2::jsonb, $3)",
    [r3, JSON.stringify({ "Directories corrected": 6, "Profile views (search)": 214, "Direction requests": 31 }), ops.id]);

  await db.query("insert into public.audit_log (practice_id, action, entity, entity_id, meta) values ($1, 'practice.created', 'practice', $1, '{}')", [rb]);
  await db.exec("insert into public.demo_meta values ('snapshot_at', now()::text), ('queue_at', now()::text)");
}
