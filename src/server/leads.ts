import "server-only";
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

export type LeadKind = "waitlist" | "contact";

export interface Lead {
  kind: LeadKind;
  name: string;
  email: string;
  role?: string;
  speciality?: string;
  province?: string;
  interests?: string[];
  topic?: string;
  message?: string;
  consent: boolean;
  sourcePath?: string;
}

export const ROLES = ["patient", "practitioner", "practice-owner", "practice-manager", "marketing-partner", "other"] as const;
export const INTERESTS = ["app", "os", "growth", "flow"] as const;
export const TOPICS = ["general", "practitioner-partnership", "growth-services", "press", "privacy-request", "support"] as const;
export const PROVINCES = ["Eastern Cape", "Free State", "Gauteng", "KwaZulu-Natal", "Limpopo", "Mpumalanga", "North West", "Northern Cape", "Western Cape", "Outside South Africa"] as const;

export class NotConfiguredError extends Error {}

type Errors = Record<string, string>;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const clean = (v: unknown, max: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "");

/** Server-side validation. Never trust the client form. */
export function validateLead(input: unknown): { lead?: Lead; errors?: Errors } {
  const b = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const errors: Errors = {};
  const kind = b.kind === "contact" ? "contact" : "waitlist";
  const name = clean(b.name, 120);
  const email = clean(b.email, 254).toLowerCase();
  if (name.length < 2) errors.name = "Please tell us your name.";
  if (!EMAIL.test(email)) errors.email = "Enter a valid email address.";
  if (b.consent !== true) errors.consent = kind === "waitlist" ? "Please agree so we can email you about BabyBlue." : "Please agree so we can reply to you.";

  const lead: Lead = { kind, name, email, consent: b.consent === true, sourcePath: clean(b.sourcePath, 120) || undefined };

  if (kind === "waitlist") {
    const role = clean(b.role, 40);
    if (!(ROLES as readonly string[]).includes(role)) errors.role = "Choose the option that fits you best.";
    lead.role = role;
    lead.speciality = clean(b.speciality, 120) || undefined;
    const prov = clean(b.province, 40);
    if (prov && !(PROVINCES as readonly string[]).includes(prov)) errors.province = "Choose a province from the list.";
    lead.province = prov || undefined;
    lead.interests = Array.isArray(b.interests) ? b.interests.filter((i): i is string => typeof i === "string" && (INTERESTS as readonly string[]).includes(i)).slice(0, 4) : [];
  } else {
    const topic = clean(b.topic, 40);
    if (!(TOPICS as readonly string[]).includes(topic)) errors.topic = "Choose a topic.";
    lead.topic = topic;
    const message = typeof b.message === "string" ? b.message.trim().slice(0, 4000) : "";
    if (message.length < 10) errors.message = "Tell us a little more (at least 10 characters).";
    lead.message = message;
  }
  return Object.keys(errors).length ? { errors } : { lead };
}

/** Persist a lead. Production uses Supabase (service role, server only). Local development writes to .data/. */
export async function saveLead(lead: Lead): Promise<void> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) {
    const res = await fetch(`${url.replace(/\/$/, "")}/rest/v1/leads`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({
        kind: lead.kind,
        name: lead.name,
        email: lead.email,
        role: lead.role ?? null,
        speciality: lead.speciality ?? null,
        province: lead.province ?? null,
        interests: lead.interests ?? [],
        topic: lead.topic ?? null,
        message: lead.message ?? null,
        consent: lead.consent,
        source_path: lead.sourcePath ?? null,
      }),
    });
    if (!res.ok) throw new Error(`lead storage failed (${res.status})`);
    return;
  }
  if (process.env.NODE_ENV === "development") {
    const dir = path.join(process.cwd(), ".data");
    await mkdir(dir, { recursive: true });
    await appendFile(path.join(dir, "leads.jsonl"), JSON.stringify({ ...lead, at: new Date().toISOString() }) + "\n");
    return;
  }
  throw new NotConfiguredError("No lead storage configured");
}
