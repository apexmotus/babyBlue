import type { DB, Patient, Question, Visit } from "./types";
import { TODAY, makeDemoId } from "./util";

export const DB_VERSION = 1;
export const DEMO_VISIT_ID = "v-thabo";

const p = (
  id: string,
  first: string,
  last: string,
  phone: string,
  extra: Partial<Patient> = {},
): Patient => ({
  id,
  first,
  last,
  phone,
  whatsapp: true,
  idType: "RSA ID",
  nationality: "South Africa",
  consent: true,
  consentDate: "2026-05-03",
  visitsBase: 3,
  notes: [],
  ...extra,
});

const patients: Patient[] = [
  p("p-thabo", "Thabo", "Dlamini", "082 431 9087", {
    age: 34,
    dob: "1992-03-18",
    idNumber: makeDemoId("920318"),
    consentDate: TODAY,
    visitsBase: 6,
    summary: "RSA ID on file",
    address: "7 Jorissen Street, Braamfontein",
    nextOfKin: "Zinhle Dlamini · 073 556 0192",
  }),
  p("p-lerato", "Lerato", "Mokoena", "073 812 4460", {
    age: 41,
    dob: "1985-07-02",
    medicalAid: "Discovery Classic",
    summary: "Discovery Classic",
    visitsBase: 8,
    address: "14 Tyrone Avenue, Parkview",
  }),
  p("p-sipho", "Sipho", "Khumalo", "084 990 3312", {
    age: 57,
    dob: "1969-04-12",
    idNumber: "690412 •••• •••",
    medicalAid: "Bonitas Standard",
    summary: "hypertension follow-up",
    visitsBase: 23,
    address: "42 Oxford Road, Saxonwold",
    nextOfKin: "Nomvula Khumalo · 082 118 7745",
    consentDate: "2026-05-03",
    notes: [
      { id: "n1", text: "On amlodipine 5 mg. Readings at home averaging 138/86 over the last month.", by: "Dr N. Mokoena", date: "2026-09-02" },
      { id: "n2", text: "Prefers morning appointments. Contact by WhatsApp, not calls.", by: "Reception", date: "2026-07-28" },
    ],
  }),
  p("p-fatima", "Fatima", "Patel", "082 776 1104", {
    age: 29,
    idType: "Passport",
    nationality: "India",
    summary: "passport on file",
    consent: false,
    consentDate: undefined,
    visitsBase: 2,
  }),
  p("p-grace", "Grace", "Nkosi", "079 554 2018", { age: 63, summary: "wound care", visitsBase: 11 }),
  p("p-anna", "Anna", "van Wyk", "061 220 8845", { age: 38, summary: "booked follow-up", visitsBase: 4 }),
  p("p-nomvula", "Nomvula", "Khumalo", "082 118 7745", { age: 54, summary: "last visit 19 Jul 2026", visitsBase: 5 }),
  p("p-kagiso", "Kagiso", "Molefe", "071 338 5521", { age: 26, visitsBase: 1 }),
  p("p-priya", "Priya", "Naidoo", "083 447 9012", { age: 45, visitsBase: 7 }),
  p("p-mandla", "Mandla", "Zulu", "078 200 4417", { age: 31, visitsBase: 2 }),
  p("p-johan", "Johan", "Botha", "082 661 3089", { age: 68, visitsBase: 19 }),
  p("p-zanele", "Zanele", "Dube", "072 990 1135", { age: 22, visitsBase: 1 }),
  p("p-ayesha", "Ayesha", "Khan", "084 115 7743", { age: 36, visitsBase: 6 }),
  p("p-pieter", "Pieter", "Venter", "082 309 6620", { age: 59, visitsBase: 14 }),
  p("p-busi", "Busisiwe", "Mahlangu", "060 884 2271", { age: 47, visitsBase: 9 }),
  p("p-tshepo", "Tshepo", "Sithole", "076 512 0938", { age: 33, visitsBase: 3 }),
  p("p-naomi", "Naomi", "Adams", "081 770 4416", { age: 52, visitsBase: 12 }),
  p("p-daniel", "Daniel", "Ncube", "079 023 8854", { age: 40, visitsBase: 5 }),
];

let seq = 0;
const v = (
  id: string,
  patientId: string,
  status: Visit["status"],
  joinedAt: string,
  reason: string,
  extra: Partial<Visit> = {},
): Visit => ({
  id,
  seq: ++seq,
  patientId,
  day: TODAY,
  reason,
  urgency: "routine",
  status,
  source: "qr",
  kind: "Walk-in",
  joinedAt,
  ...extra,
});

const done = (id: string, pid: string, joined: string, called: string, finished: string, reason: string, doctor: string, room: string, extra: Partial<Visit> = {}) =>
  v(id, pid, "done", joined, reason, { calledAt: called, doneAt: finished, doctor, room, ...extra });

const visits: Visit[] = [
  // Done today (9)
  done("v-johan", "p-johan", "07:41", "07:48", "08:02", "Repeat script", "Dr A. Petersen", "Room 1"),
  done("v-pieter", "p-pieter", "07:52", "08:03", "08:21", "Blood pressure check", "Dr N. Mokoena", "Room 2"),
  done("v-zanele", "p-zanele", "08:05", "08:22", "08:40", "Cough or cold", "Dr A. Petersen", "Room 1"),
  done("v-grace", "p-grace", "08:44", "08:51", "09:02", "Dressing change", "Sister Adams", "Room 3"),
  done("v-ayesha", "p-ayesha", "08:12", "08:41", "09:04", "Stomach complaint", "Dr N. Mokoena", "Room 2"),
  done("v-naomi", "p-naomi", "08:30", "09:03", "09:16", "Vaccination", "Sister Adams", "Room 3"),
  done("v-busi", "p-busi", "08:50", "09:05", "09:24", "Repeat script", "Dr A. Petersen", "Room 1"),
  done("v-tshepo", "p-tshepo", "09:01", "09:17", "09:33", "Sore throat", "Dr N. Mokoena", "Room 2"),
  done("v-daniel", "p-daniel", "09:08", "09:25", "09:42", "Injury or wound", "Dr A. Petersen", "Room 1"),
  // In consultation (2)
  v("v-fatima", "p-fatima", "in_consultation", "09:38", "Chest pain", { urgency: "urgent", calledAt: "09:44", doctor: "Dr N. Mokoena", room: "Room 2" }),
  v("v-mandla", "p-mandla", "in_consultation", "09:30", "Back pain", { calledAt: "09:46", doctor: "Dr A. Petersen", room: "Room 1" }),
  // Waiting (6)
  v("v-thabo", "p-thabo", "waiting", "09:12", "Cough or cold symptoms", {
    intake: {
      at: "09:19",
      answers: { q1: "Cough or cold symptoms", q2: "3–7 days", q3: 4, q4: "No" },
    },
    note: "Productive cough 5 days, no fever reported at intake. Check chest, consider swab if febrile on examination.",
  }),
  v("v-lerato", "p-lerato", "waiting", "09:20", "Repeat script", { urgency: "soon" }),
  v("v-sipho", "p-sipho", "waiting", "09:31", "Blood pressure check"),
  v("v-anna", "p-anna", "waiting", "09:52", "Follow-up", { source: "booked", kind: "Booked", bookedFor: "10:00" }),
  v("v-kagiso", "p-kagiso", "waiting", "09:54", "Sore throat"),
  v("v-priya", "p-priya", "waiting", "09:55", "Vaccination", { urgency: "soon" }),
];

// Past history for the demo patient file (Sipho)
const past = (id: string, pid: string, day: string, status: Visit["status"], kind: Visit["kind"], detail: string, reason: string): Visit => ({
  id,
  seq: ++seq,
  patientId: pid,
  day,
  reason,
  urgency: "routine",
  status,
  source: kind === "Booked" ? "booked" : "qr",
  kind,
  joinedAt: "08:00",
  detail,
});
visits.push(
  past("h1", "p-sipho", "2026-09-02", "done", "Booked", "Repeat prescription · Dr Petersen", "Repeat script"),
  past("h2", "p-sipho", "2026-07-28", "done", "Walk-in", "Blood pressure check · Dr Mokoena", "Blood pressure check"),
  past("h3", "p-sipho", "2026-06-11", "cancelled", "Booked", "Did not arrive", "Blood pressure check"),
  past("h4", "p-sipho", "2026-05-03", "done", "Walk-in", "Flu vaccination · Sister Adams", "Vaccination"),
  past("h5", "p-lerato", "2026-09-02", "done", "Walk-in", "Repeat prescription · Dr Mokoena", "Repeat script"),
  past("h6", "p-nomvula", "2026-07-19", "done", "Walk-in", "Check-up · Dr Petersen", "Check-up"),
  past("h7", "p-thabo", "2026-08-11", "done", "Walk-in", "Flu symptoms · Dr Mokoena", "Cough or cold"),
);

export const questions: Question[] = [
  {
    id: "q1",
    type: "choice",
    label: "What brings you in today?",
    options: [
      "Cough or cold symptoms",
      "Repeat script",
      "Blood pressure check",
      "Injury or wound",
      "Stomach complaint",
      "Vaccination",
      "Something else",
    ],
    required: true,
    active: true,
  },
  {
    id: "q2",
    type: "choice",
    label: "How long has this been going on?",
    options: ["Today", "1–2 days", "3–7 days", "More than a week"],
    required: true,
    active: true,
  },
  {
    id: "q3",
    type: "scale",
    label: "How would you rate the pain or discomfort right now?",
    min: 0,
    max: 5,
    lowLabel: "None",
    highLabel: "Severe",
    required: true,
    active: true,
  },
  { id: "q4", type: "yesno", label: "Are you taking any chronic medication?", required: true, active: true },
  {
    id: "q5",
    type: "yesno",
    label: "Have you been here before?",
    required: false,
    active: false,
    note: "off — answered automatically from the file",
  },
];

export function makeSeed(): DB {
  seq = 0;
  // Rebuild visits with fresh seq numbers each time so reset is deterministic.
  const fresh = JSON.parse(JSON.stringify({ patients, visits, questions })) as {
    patients: Patient[];
    visits: Visit[];
    questions: Question[];
  };
  fresh.visits.forEach((x, i) => (x.seq = i + 1));
  return {
    v: DB_VERSION,
    startedAt: 0,
    updatedAt: 0,
    nextSeq: fresh.visits.length + 1,
    nextId: 1,
    patients: fresh.patients,
    visits: fresh.visits,
    bookings: [],
    questions: fresh.questions,
    settings: {
      name: "Rosebank Family Practice",
      slug: "rosebank-family",
      address: "18 Cradock Avenue, Rosebank, Johannesburg, 2196",
      phone: "011 447 2210",
      avgConsult: 15,
      medianWait: 24,
      showEstimates: true,
      doctors: ["Dr N. Mokoena", "Dr A. Petersen", "Sister Adams"],
      hours: [
        { open: "07:30", close: "17:00", closed: false },
        { open: "07:30", close: "17:00", closed: false },
        { open: "07:30", close: "17:00", closed: false },
        { open: "07:30", close: "17:00", closed: false },
        { open: "07:30", close: "16:00", closed: false },
        { open: "08:00", close: "12:00", closed: false },
        { open: "", close: "", closed: true },
      ],
      blocks: [
        { id: "b1", title: "Lunch — every weekday", start: "13:00", end: "13:45", days: [0, 1, 2, 3, 4] },
        { id: "b2", title: "Dr Petersen — theatre list", start: "08:00", end: "12:00", date: "2026-10-16", doctor: "Dr A. Petersen" },
        { id: "b3", title: "Public holiday — Heritage Day", start: "00:00", end: "23:59", date: "2026-09-24", allDay: true },
      ],
      staff: [
        { id: "s1", name: "Naledi Mokoena", email: "naledi@rosebankfamily.co.za", role: "Admin", last: "Active now" },
        { id: "s2", name: "Busi Radebe", email: "reception@rosebankfamily.co.za", role: "Reception", last: "Today, 07:21" },
        { id: "s3", name: "Dr Andile Petersen", email: "andile@rosebankfamily.co.za", role: "Clinician", last: "Yesterday" },
      ],
    },
    profile: {
      first: "Naledi",
      last: "Mokoena",
      email: "naledi@rosebankfamily.co.za",
      mobile: "083 204 7712",
      hpcsa: "MP0784412",
      role: "Admin",
      alertWalkIn: true,
      dailySummary: true,
    },
    session: null,
    device: null,
  };
}

export const OTHER_CLINICS = [
  { slug: "parktown-north-dental", name: "Parktown North Dental", type: "Dentist", kind: "dentist", distance: "2.4 km", street: "3rd Ave", open: true, mode: "booking" },
  { slug: "melville-community-clinic", name: "Melville Community Clinic", type: "Clinic", kind: "gp", distance: "4.1 km", street: "Main Rd", open: false, opens: "Opens tomorrow at 07:30", mode: "queue" },
  { slug: "killarney-medical-centre", name: "Killarney Medical Centre", type: "General practice", kind: "gp", distance: "5.6 km", street: "", open: false, opens: "Opens tomorrow at 08:00", mode: "queue" },
] as const;
