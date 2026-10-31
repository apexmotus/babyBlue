import "server-only";
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

export type LeadKind = "contact";

export interface Lead {
  kind: LeadKind;
  name: string;
  email: string;
  topic?: string;
  message?: string;
  consent: boolean;
  sourcePath?: string;
}

export const TOPICS = ["general", "practitioner-partnership", "growth-services", "press", "privacy-request", "support"] as const;

export class NotConfiguredError extends Error {}

type Errors = Record<string, string>;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const clean = (v: unknown, max: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "");

/** Server-side validation. Never trust the client form. */
export function validateLead(input: unknown): { lead?: Lead; errors?: Errors } {
  const b = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const errors: Errors = {};
  const kind = "contact" as const;
  const name = clean(b.name, 120);
  const email = clean(b.email, 254).toLowerCase();
  if (name.length < 2) errors.name = "Please tell us your name.";
  if (!EMAIL.test(email)) errors.email = "Enter a valid email address.";
  if (b.consent !== true) errors.consent = "Please agree so we can reply to you.";

  const lead: Lead = { kind, name, email, consent: b.consent === true, sourcePath: clean(b.sourcePath, 120) || undefined };

  const topic = clean(b.topic, 40);
  if (!(TOPICS as readonly string[]).includes(topic)) errors.topic = "Choose a topic.";
  lead.topic = topic;
  const message = typeof b.message === "string" ? b.message.trim().slice(0, 4000) : "";
  if (message.length < 10) errors.message = "Tell us a little more (at least 10 characters).";
  lead.message = message;
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
