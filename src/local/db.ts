"use client";

import { PGliteWorker } from "@electric-sql/pglite/worker";

/** Bump to rebuild the local database (users lose local demo data) after a schema change. */
export const LOCAL_DB_VERSION = 7;
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
// The code → prose contract lives in src/lib/api/messages.ts, which has no dependencies so
// that Server Components and src/lib/api/http.ts can import it (this module cannot: it is
// "use client" and pulls in PGlite). Re-exported here because the demo screens import from
// "@/local/db".
export { MESSAGES, friendlyError } from "@/lib/api/messages";

// Debug handle for performance checks from the browser console.
if (typeof window !== "undefined") (window as unknown as { __bb: unknown }).__bb = { getDb, query };
