"use client";

import { useSyncExternalStore } from "react";
import type { Block, Booking, DB, Patient, Question, Settings, Urgency, Visit } from "./types";
import { DB_VERSION, makeSeed } from "./seed";
import { START_MINUTES, TODAY, ageFrom, estimate, hhmm, shortDate, toMins, uid, dayIndex } from "./util";

const KEY = "bb_demo_v1";
const listeners = new Set<() => void>();
const serverSeed = makeSeed();
let state: DB = serverSeed;
let ready = false;

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable — demo still works in-memory */
  }
}
function emit() {
  listeners.forEach((l) => l());
}
function ensure() {
  if (ready || typeof window === "undefined") return;
  ready = true;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DB;
      if (parsed.v === DB_VERSION) state = parsed;
    }
  } catch {
    /* ignore corrupt storage */
  }
  if (state === serverSeed) {
    state = { ...makeSeed(), startedAt: Date.now() };
    persist();
  }
  window.addEventListener("storage", (e) => {
    if (e.key === KEY && e.newValue) {
      try {
        state = JSON.parse(e.newValue) as DB;
        emit();
      } catch {
        /* ignore */
      }
    }
  });
}
function subscribe(cb: () => void) {
  ensure();
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function getSnapshot() {
  ensure();
  return state;
}
const getServerSnapshot = () => serverSeed;

export function useDB(): DB {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

function mutate(fn: (d: DB) => void) {
  ensure();
  const next = structuredClone(state);
  fn(next);
  next.updatedAt = Date.now();
  state = next;
  persist();
  emit();
}

/* ───────── clock ───────── */
export function clockMins(d: DB) {
  const elapsed = d.startedAt ? Math.floor((Date.now() - d.startedAt) / 60000) : 0;
  return START_MINUTES + elapsed;
}
export const clock = (d: DB) => hhmm(clockMins(d));

/* ───────── selectors ───────── */
export const todays = (d: DB) => d.visits.filter((v) => v.day === TODAY);
export const waitingList = (d: DB) => todays(d).filter((v) => v.status === "waiting").sort((a, b) => a.seq - b.seq);
export function positionOf(d: DB, id: string) {
  const i = waitingList(d).findIndex((v) => v.id === id);
  return i < 0 ? 0 : i + 1;
}
export const estimateFor = (d: DB, pos: number) => estimate(pos, d.settings.avgConsult);
export const patientOf = (d: DB, id: string) => d.patients.find((p) => p.id === id);
export const visitById = (d: DB, id: string) => d.visits.find((v) => v.id === id);
export const fullName = (p?: Patient) => (p ? `${p.first} ${p.last}` : "Unknown");
export const activeQuestions = (d: DB) => d.questions.filter((q) => q.active);

export function isOpenNow(d: DB) {
  const h = d.settings.hours[dayIndex(TODAY)];
  if (!h || h.closed) return false;
  const now = clockMins(d);
  return now >= toMins(h.open) && now < toMins(h.close);
}
export function closesAt(d: DB) {
  return d.settings.hours[dayIndex(TODAY)]?.close ?? "17:00";
}

export function lastVisitDay(d: DB, patientId: string) {
  const days = d.visits.filter((v) => v.patientId === patientId && v.status !== "cancelled").map((v) => v.day).sort();
  return days[days.length - 1];
}
export function lastVisitLabel(d: DB, patientId: string) {
  const today = todays(d).find((v) => v.patientId === patientId && (v.status === "waiting" || v.status === "in_consultation"));
  if (today) return today.status === "waiting" ? "In the queue now" : "In consultation";
  const day = lastVisitDay(d, patientId);
  return day ? shortDate(day) : "—";
}

/* ───────── patients ───────── */
export interface PatientInput {
  first: string;
  last: string;
  phone: string;
  whatsapp: boolean;
  idType: string;
  idNumber?: string;
  nationality?: string;
  email?: string;
  dob?: string;
  consent?: boolean;
}

function upsertPatient(d: DB, input: PatientInput): Patient {
  const digits = input.phone.replace(/\D/g, "").replace(/^27/, "0");
  let patient = d.patients.find((p) => p.phone.replace(/\D/g, "").replace(/^27/, "0") === digits);
  if (!patient) {
    patient = {
      id: uid("p-", d.nextId++),
      first: input.first,
      last: input.last,
      phone: input.phone,
      whatsapp: input.whatsapp,
      email: input.email,
      idType: input.idType,
      idNumber: input.idNumber,
      nationality: input.nationality ?? "South Africa",
      dob: input.dob,
      age: input.dob ? ageFrom(input.dob) : undefined,
      consent: !!input.consent,
      consentDate: input.consent ? TODAY : undefined,
      visitsBase: 0,
      notes: [],
    };
    d.patients.push(patient);
  } else {
    patient.whatsapp = input.whatsapp;
    if (input.consent && !patient.consent) {
      patient.consent = true;
      patient.consentDate = TODAY;
    }
    if (input.idNumber && !patient.idNumber) patient.idNumber = input.idNumber;
  }
  return patient;
}

export function addPatient(input: PatientInput) {
  let id = "";
  mutate((d) => {
    id = upsertPatient(d, input).id;
  });
  return id;
}

export function updatePatient(id: string, patch: Partial<Patient>) {
  mutate((d) => {
    const p = d.patients.find((x) => x.id === id);
    if (p) Object.assign(p, patch);
  });
}

export function addPatientNote(id: string, text: string) {
  mutate((d) => {
    const p = d.patients.find((x) => x.id === id);
    if (!p) return;
    p.notes.unshift({ id: uid("n", d.nextId++), text, by: `${d.profile.first} ${d.profile.last}`, date: TODAY });
  });
}

export function setConsent(id: string, consent: boolean) {
  mutate((d) => {
    const p = d.patients.find((x) => x.id === id);
    if (!p) return;
    p.consent = consent;
    p.consentDate = consent ? TODAY : undefined;
  });
}

/* ───────── queue ───────── */
export interface JoinInput extends PatientInput {
  reason?: string;
  urgency?: Urgency;
  source?: Visit["source"];
  remember?: boolean;
}

export function joinQueue(input: JoinInput): string {
  let visitId = "";
  mutate((d) => {
    const patient = upsertPatient(d, input);
    const source = input.source ?? "qr";
    const visit: Visit = {
      id: uid("v-", d.nextId++),
      seq: d.nextSeq++,
      patientId: patient.id,
      day: TODAY,
      reason: input.reason || "To be confirmed at reception",
      urgency: input.urgency ?? "routine",
      status: "waiting",
      source,
      kind: "Walk-in",
      joinedAt: clock(d),
    };
    d.visits.push(visit);
    visitId = visit.id;
    if (input.remember) {
      d.device = {
        first: input.first,
        last: input.last,
        phone: input.phone,
        whatsapp: input.whatsapp,
        idType: input.idType,
        idNumber: input.idNumber ?? "",
      };
    }
  });
  return visitId;
}

export function clearDevice() {
  mutate((d) => {
    d.device = null;
  });
}

function nextRoom(d: DB, doctor?: string) {
  const by = { "Dr N. Mokoena": "Room 2", "Dr A. Petersen": "Room 1", "Sister Adams": "Room 3" } as Record<string, string>;
  // Each practitioner has a fixed room; fall back to the first room nobody is in.
  if (doctor && by[doctor]) return by[doctor];
  const busy = new Set(todays(d).filter((v) => v.status === "in_consultation").map((v) => v.room));
  return ["Room 2", "Room 1", "Room 3"].find((r) => !busy.has(r)) ?? "Room 2";
}

export function callVisit(id: string) {
  mutate((d) => {
    const v = d.visits.find((x) => x.id === id);
    if (!v || v.status !== "waiting") return;
    const inRoom = todays(d).filter((x) => x.status === "in_consultation");
    const docs = d.settings.doctors.filter((doc) => doc.startsWith("Dr"));
    const pool = docs.length ? docs : d.settings.doctors;
    // Prefer a free doctor; otherwise the one who has been in consult the longest.
    const free = pool.find((doc) => !inRoom.some((x) => x.doctor === doc));
    const longest = [...pool].sort((a, b) => {
      const t = (doc: string) => Math.min(...inRoom.filter((x) => x.doctor === doc).map((x) => toMins(x.calledAt ?? "23:59")));
      return t(a) - t(b);
    })[0];
    const doctor = free ?? longest;
    v.status = "in_consultation";
    v.calledAt = clock(d);
    v.doctor = doctor;
    v.room = nextRoom(d, doctor);
  });
}

export function markSeen(id: string) {
  mutate((d) => {
    const v = d.visits.find((x) => x.id === id);
    if (!v || v.status !== "in_consultation") return;
    v.status = "done";
    v.doneAt = clock(d);
    const p = d.patients.find((x) => x.id === v.patientId);
    if (p) p.visitsBase += 1;
  });
}

export function cancelVisit(id: string, by: "reception" | "patient") {
  mutate((d) => {
    const v = d.visits.find((x) => x.id === id);
    if (!v || v.status === "done" || v.status === "cancelled") return;
    v.status = "cancelled";
    v.cancelledBy = by;
    v.cancelledAt = clock(d);
  });
}

export function saveNote(id: string, note: string) {
  mutate((d) => {
    const v = d.visits.find((x) => x.id === id);
    if (v) v.note = note;
  });
}

export function submitIntake(id: string, answers: Record<string, string | number>) {
  mutate((d) => {
    const v = d.visits.find((x) => x.id === id);
    if (v) v.intake = { answers, at: clock(d) };
    if (v && answers.q1 && (v.reason === "To be confirmed at reception" || !v.reason)) v.reason = String(answers.q1);
  });
}

export function submitFeedback(id: string, rating: number, comment: string) {
  mutate((d) => {
    const v = d.visits.find((x) => x.id === id);
    if (v) v.feedback = { rating, comment };
  });
}

const DEMO_PEOPLE = [
  ["Karabo", "Sebola", "Ear pain"],
  ["Megan", "Pretorius", "Repeat script"],
  ["Lwazi", "Cele", "Cough or cold symptoms"],
  ["Nadia", "Hendricks", "Vaccination"],
  ["Themba", "Mthembu", "Blood pressure check"],
  ["Elena", "Marais", "Rash"],
  ["Sifiso", "Ndlovu", "Injury or wound"],
];
export function simulateJoin() {
  let name = "";
  mutate((d) => {
    const [first, last, reason] = DEMO_PEOPLE[d.nextId % DEMO_PEOPLE.length];
    d.nextId++;
    const phone = `07${Math.floor(1 + Math.random() * 8)} ${String(Math.floor(100 + Math.random() * 899))} ${String(Math.floor(1000 + Math.random() * 8999))}`;
    const patient = upsertPatient(d, { first, last, phone, whatsapp: true, idType: "RSA ID", consent: true });
    d.visits.push({
      id: uid("v-", d.nextId++),
      seq: d.nextSeq++,
      patientId: patient.id,
      day: TODAY,
      reason,
      urgency: "routine",
      status: "waiting",
      source: "qr",
      kind: "Walk-in",
      joinedAt: clock(d),
    });
    name = `${first} ${last}`;
  });
  return name;
}

/* ───────── bookings ───────── */
export function createBooking(b: Omit<Booking, "id">) {
  mutate((d) => {
    d.bookings.push({ ...b, id: uid("b-", d.nextId++) });
  });
}

export function blockedFor(d: DB, day: string, doctor: string, time: string) {
  const t = toMins(time);
  const di = dayIndex(day);
  const hit = d.settings.blocks.some((b) => {
    const applies = b.date ? b.date === day : b.days?.includes(di);
    if (!applies) return false;
    if (b.doctor && b.doctor !== doctor) return false;
    return b.allDay || (t >= toMins(b.start) && t < toMins(b.end));
  });
  if (hit) return true;
  return d.bookings.some((x) => x.day === day && x.doctor === doctor && x.time === time);
}

/* ───────── settings ───────── */
export function saveSettings(patch: Partial<Settings>) {
  mutate((d) => {
    Object.assign(d.settings, patch);
  });
}
export function saveBlock(block: Block) {
  mutate((d) => {
    const i = d.settings.blocks.findIndex((b) => b.id === block.id);
    if (i >= 0) d.settings.blocks[i] = block;
    else d.settings.blocks.push(block);
  });
}
export function deleteBlock(id: string) {
  mutate((d) => {
    d.settings.blocks = d.settings.blocks.filter((b) => b.id !== id);
  });
}
export function inviteStaff(name: string, email: string, role: "Reception" | "Clinician") {
  mutate((d) => {
    d.settings.staff.push({ id: uid("s", d.nextId++), name, email, role, last: "Invited" });
  });
}
export function saveProfile(patch: Partial<DB["profile"]>) {
  mutate((d) => {
    Object.assign(d.profile, patch);
    d.settings.staff[0].name = `${d.profile.first} ${d.profile.last}`;
    if (d.session) d.session.name = `${d.profile.first} ${d.profile.last}`;
  });
}

/* ───────── intake questions ───────── */
export function saveQuestion(q: Question) {
  mutate((d) => {
    const i = d.questions.findIndex((x) => x.id === q.id);
    if (i >= 0) d.questions[i] = q;
    else d.questions.push(q);
  });
}
export function deleteQuestion(id: string) {
  mutate((d) => {
    d.questions = d.questions.filter((q) => q.id !== id);
  });
}
export function moveQuestion(id: string, dir: -1 | 1) {
  mutate((d) => {
    const actives = d.questions.filter((q) => q.active);
    const idx = actives.findIndex((q) => q.id === id);
    const target = actives[idx + dir];
    if (!target) return;
    const a = d.questions.findIndex((q) => q.id === id);
    const b = d.questions.findIndex((q) => q.id === target.id);
    [d.questions[a], d.questions[b]] = [d.questions[b], d.questions[a]];
  });
}
export function newQuestionId() {
  return uid("q", state.nextId + 1);
}

/* ───────── session & device ───────── */
export function signIn(email: string) {
  mutate((d) => {
    d.session = { email, name: `${d.profile.first} ${d.profile.last}` };
  });
}
export function signOut() {
  mutate((d) => {
    d.session = null;
  });
}
export function completeOnboarding(patch: { name: string; slug: string; address: string; phone: string; avgConsult: number }, profile: Partial<DB["profile"]>) {
  mutate((d) => {
    Object.assign(d.settings, patch);
    Object.assign(d.profile, profile);
    d.settings.staff[0].name = `${d.profile.first} ${d.profile.last}`;
    d.settings.staff[0].email = d.profile.email;
    d.session = { email: d.profile.email, name: `${d.profile.first} ${d.profile.last}` };
  });
}

export function resetDemo() {
  ensure();
  const session = state.session;
  state = { ...makeSeed(), startedAt: Date.now(), session };
  persist();
  emit();
}
