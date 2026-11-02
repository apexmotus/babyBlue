import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { freshDb, IDS, run, seed, type Db } from "./harness";

/**
 * Every procedure-call SQL string in `src/lib/api/*.ts` is executed against a real engine.
 *
 * These strings are the offline-demo branch of the client layer. Nothing else runs them:
 * `tsc` cannot check a SQL literal, the .NET suite exercises the API branch instead, and the
 * screens only reach them in a browser. That is exactly the gap that let every call site in
 * `patient.ts` sit broken behind a green suite — so the strings are extracted from the source
 * and run here, which catches a wrong parameter count, a missing cast or a renamed procedure at
 * test time rather than in front of a user.
 */

const MODULES = ["practice.ts", "growth.ts", "platform.ts", "patient.ts", "public.ts"];

interface Extracted {
  module: string;
  sql: string;
  params: number;
}

/** Pull every `"select ... public.<proc>(...)"` literal out of a client module. */
function extractProcedureCalls(module: string): Extracted[] {
  const source = readFileSync(path.resolve(__dirname, "../../src/lib/api", module), "utf8");
  const out: Extracted[] = [];

  // Matched narrowly rather than by parsing every string literal: a full-literal scan desynced
  // on template literals containing `${}` and silently found 4 of 62.
  const literal = /["`](select\b[\s\S]*?)["`]/gi;
  for (const m of source.matchAll(literal)) {
    const raw = m[1].replace(/\s+/g, " ").trim();
    if (!/\bpublic\.[a-z_]+\s*\(/.test(raw)) continue;

    const placeholders = [...raw.matchAll(/\$(\d+)/g)].map((p) => Number(p[1]));
    out.push({ module, sql: raw, params: placeholders.length ? Math.max(...placeholders) : 0 });
  }
  return out;
}

/**
 * A value for each placeholder. Correctness of the value does not matter — a wrong *shape*
 * raises 42883 (no such function) or 42P18 (cannot determine type), which is what this catches.
 * A row simply not existing is a pass.
 */
function argFor(sql: string, index: number): unknown {
  const i = index + 1;
  // Array parameters are cast in the SQL, so an empty array of the right kind is enough.
  if (new RegExp(`\\$${i}::uuid\\[\\]`).test(sql)) return [];
  if (new RegExp(`\\$${i}::int\\[\\]`).test(sql)) return [];
  if (new RegExp(`\\$${i}::text\\[\\]`).test(sql)) return [];
  if (new RegExp(`\\$${i}::date`).test(sql)) return "2026-06-01";
  if (new RegExp(`\\$${i}::timestamptz`).test(sql)) return "2026-06-01T09:00:00Z";
  if (new RegExp(`\\$${i}::jsonb`).test(sql)) return null;
  return null;
}

/** 42883/42P18/42704 mean the call does not match the catalogue. Anything else is the DB working. */
const SHAPE_ERRORS = new Set(["42883", "42P18", "42704", "42601", "42703"]);

describe("client-layer procedure calls match the catalogue", () => {
  let db: Db;
  const calls = MODULES.flatMap(extractProcedureCalls);

  beforeAll(async () => {
    db = await freshDb();
    await seed(db);
  }, 120_000);

  it("extracts a meaningful number of calls from every module", () => {
    // A refactor that moved the SQL elsewhere would otherwise make this suite vacuously pass.
    for (const m of MODULES) {
      expect(calls.filter((c) => c.module === m).length, `${m} has no procedure calls`).toBeGreaterThan(0);
    }
    expect(calls.length).toBeGreaterThan(100);
  });

  it("every call names a procedure that exists with a matching arity", async () => {
    const failures: string[] = [];

    for (const call of calls) {
      const proc = call.sql.match(/public\.([a-z_]+)\s*\(/)?.[1] ?? "";
      const args = Array.from({ length: call.params }, (_, i) => argFor(call.sql, i));

      try {
        await run(db, IDS.ownerA, call.sql, args);
      } catch (e) {
        const code = (e as { code?: string }).code ?? "";
        const message = (e as Error).message ?? "";
        if (SHAPE_ERRORS.has(code) || /does not exist|could not determine/i.test(message)) {
          failures.push(`${call.module} → public.${proc}: [${code}] ${message}`);
        }
        // Any other error is the procedure running and refusing — which is a pass here.
      }
    }

    expect(failures, `${failures.length} call(s) do not match the catalogue:\n${failures.join("\n")}`).toEqual([]);
  }, 180_000);

  it("names only procedures in the generated catalogue, never a legacy function", () => {
    // The whole point of the migration: the UI must call the 106, not the pre-Stage-3 set that
    // Stage 5 is about to revoke table grants out from under.
    const legacy = [
      "practice_stats", "practice_insights", "practice_team", "staff_create_appointment",
      "set_appointment_status", "get_available_slots", "add_practice_member_by_email",
      "remove_practice_member", "create_practice", "activate_practice", "appointment_history",
      "cancel_appointment", "reschedule_appointment", "queue_add_walkin", "queue_set_status",
      "marketing_inbox", "marketing_set_status", "decide_approval", "admin_overview",
      "grant_platform_role", "set_verification", "submit_verification", "my_platform_role",
      "search_practitioners", "my_appointments", "hold_slot", "book_appointment",
      "delete_my_account", "check_in_appointment", "join_queue", "get_queue_status",
      "leave_queue", "release_hold", "practice_insights",
    ];

    const offenders = calls
      .map((c) => ({ ...c, proc: c.sql.match(/public\.([a-z_]+)\s*\(/)?.[1] ?? "" }))
      .filter((c) => legacy.includes(c.proc))
      .map((c) => `${c.module} still calls public.${c.proc}`);

    expect(offenders).toEqual([]);
  });
});
