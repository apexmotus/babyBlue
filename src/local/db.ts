"use client";

import { PGliteWorker } from "@electric-sql/pglite/worker";

/** Bump to rebuild the local database (users lose local demo data) after a schema change. */
export const LOCAL_DB_VERSION = 6;
const DATA_DIR = `idb://babyblue-local-v${LOCAL_DB_VERSION}`;

let dbPromise: Promise<PGliteWorker> | null = null;

export function getDb(): Promise<PGliteWorker> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
      const db = new PGliteWorker(worker, { dataDir: DATA_DIR, id: "babyblue-local" });
      await db.waitReady;
      return db;
    })();
    dbPromise.catch(() => {
      dbPromise = null;
    });
  }
  return dbPromise;
}

/** Throw away the local database and reload (re-seeds fictional demo data). */
export async function resetLocalDb() {
  try {
    const db = await dbPromise;
    await db?.close();
  } catch {
    /* ignore */
  }
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(DATA_DIR.replace("idb://", "/pglite/"));
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
  localStorage.removeItem("bb_session_patient");
  localStorage.removeItem("bb_session_practice");
  localStorage.removeItem("bb_practice_id");
  location.href = "/";
}

/* ───────────── change notifications (same tab + other tabs) ───────────── */
const bus = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("babyblue-changes") : null;
const listeners = new Set<() => void>();
bus?.addEventListener("message", () => listeners.forEach((l) => l()));
export const onDbChange = (fn: () => void) => {
  listeners.add(fn);
  return () => void listeners.delete(fn);
};
function announce() {
  listeners.forEach((l) => l());
  bus?.postMessage("changed");
}

/**
 * Run SQL as a signed-in user (row-level security applies), or as anonymous when userId is null.
 * Each call is its own transaction, so role and identity never leak between calls.
 */
export async function query<T = Record<string, unknown>>(userId: string | null, sql: string, params: unknown[] = []): Promise<T[]> {
  const db = await getDb();
  const t0 = performance.now();
  const out = await db.transaction(async (tx) => {
    if (userId) {
      await tx.exec("set local role authenticated");
      await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
    } else {
      await tx.exec("set local role anon");
    }
    return (await tx.query<T>(sql, params)).rows;
  });
  const ms = performance.now() - t0;
  if (ms > 400) console.info(`[babyblue] slow query ${Math.round(ms)} ms: ${sql.replace(/\s+/g, " ").slice(0, 70)}`);
  return out;
}

/** Like query, but announces the change so open screens refresh. */
export async function mutate<T = Record<string, unknown>>(userId: string | null, sql: string, params: unknown[] = []): Promise<T[]> {
  const rows = await query<T>(userId, sql, params);
  announce();
  return rows;
}

/** Superuser access, used only for sign-up/sign-in plumbing (standing in for the auth service). */
export async function system<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const db = await getDb();
  return (await db.query<T>(sql, params)).rows;
}
export const announceChange = announce;

/* ───────────── friendly errors ───────────── */
const MESSAGES: Record<string, string> = {
  slot_unavailable: "Sorry, that time was just taken. Please choose another.",
  hold_expired: "Your held time ran out. Please pick a time again.",
  too_late_to_cancel: "This is inside the practice's cancellation window, so it can't be changed online. Please contact the practice.",
  not_cancellable: "This appointment can no longer be cancelled.",
  not_reschedulable: "This appointment can no longer be rescheduled.",
  too_early_to_check_in: "Check-in opens 2 hours before your appointment.",
  not_checkin_able: "This appointment can't be checked in.",
  invalid_transition: "That status change isn't allowed from the current status.",
  user_not_found: "No BabyBlue account uses that email yet. Ask them to sign up first.",
  sole_owner: "You're the only owner of this practice, so you can't be removed. Add another owner first.",
  has_records: "This account still has records attached and can't be deleted automatically. Contact us to complete the request.",
  registration_in_use: "That registration number is already linked to another profile.",
  invalid_registration: "Enter the registration body and a registration number.",
  invalid_name: "Please enter a name.",
  not_authenticated: "Please sign in to continue.",
  forbidden: "You don't have permission to do that.",
  not_found: "That record could not be found.",
};
export function friendlyError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  for (const k of Object.keys(MESSAGES)) if (msg.includes(k)) return MESSAGES[k];
  if (msg.includes("row-level security")) return "You don't have permission to do that.";
  if (msg.includes("duplicate key") && msg.includes("slug")) return "That web address is already taken. Try another.";
  if (msg.includes("duplicate key")) return "That already exists.";
  if (msg.includes("no_double_booking")) return "That time overlaps another appointment.";
  return msg.replace(/^error: /i, "");
}

// Debug handle for performance checks from the browser console.
if (typeof window !== "undefined") (window as unknown as { __bb: unknown }).__bb = { getDb, query };
