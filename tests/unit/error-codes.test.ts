import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { MESSAGES, PROCEDURE_CODES, friendlyError } from "@/lib/api/messages";
import { ApiError } from "@/lib/api/http";

const root = path.resolve(__dirname, "../..");

const handlerSource = readFileSync(
  path.join(root, "api/src/BabyBlue.Api/Middleware/ProblemDetailsExceptionHandler.cs"),
  "utf8",
);
const proceduresSql = readFileSync(
  path.join(root, "supabase/migrations/0007_4nf_and_106_procedures.sql"),
  "utf8",
);

/** Keys of a C# `FrozenDictionary<string, int>` initialiser, e.g. `["not_found"] = 404,`. */
function csharpDictKeys(source: string, fieldName: string): string[] {
  const start = source.indexOf(`Codes = new Dictionary<string, int>`, source.indexOf(fieldName));
  expect(start, `${fieldName} initialiser not found`).toBeGreaterThan(-1);
  const end = source.indexOf("ToFrozenDictionary", start);
  const body = source.slice(start, end);
  return [...body.matchAll(/\["([a-z_]+)"\]\s*=\s*\d+/g)].map((m) => m[1]);
}

/** The literal a procedure passes to `raise exception`, ignoring any `: %` format suffix. */
function sqlRaisedCodes(sql: string): string[] {
  return [...sql.matchAll(/raise exception '([a-z_]+)/g)].map((m) => m[1]);
}

describe("error code contract", () => {
  const apiProcedureCodes = new Set(csharpDictKeys(handlerSource, "Codes"));
  const apiTransportCodes = new Set(csharpDictKeys(handlerSource, "TransportCodes"));
  const sqlCodes = new Set(sqlRaisedCodes(proceduresSql));
  const tsProcedureCodes = new Set(PROCEDURE_CODES);

  // `profiles_phone_international` is a named check constraint surfaced by name, not a
  // `raise exception`, so it belongs to the vocabulary but never appears in the SQL literals.
  const constraintCodes = new Set(["profiles_phone_international"]);

  it("the TypeScript vocabulary and the API's Codes table are the same set", () => {
    expect([...tsProcedureCodes].sort()).toEqual([...apiProcedureCodes].sort());
  });

  it("every code raised in SQL is in the vocabulary, and every raisable code is raised", () => {
    const expectedFromSql = new Set([...tsProcedureCodes].filter((c) => !constraintCodes.has(c)));
    expect([...sqlCodes].sort()).toEqual([...expectedFromSql].sort());
  });

  it("every code the API can emit has user-facing prose", () => {
    const missing = [...apiProcedureCodes, ...apiTransportCodes].filter((c) => !(c in MESSAGES));
    expect(missing).toEqual([]);
  });

  it("no message is orphaned: every MESSAGES key is a code something can emit", () => {
    const emittable = new Set([...apiProcedureCodes, ...apiTransportCodes]);
    const orphans = Object.keys(MESSAGES).filter((c) => !emittable.has(c));
    expect(orphans).toEqual([]);
  });

  it("the vocabulary and the transport codes do not overlap", () => {
    const overlap = [...apiTransportCodes].filter((c) => apiProcedureCodes.has(c));
    expect(overlap).toEqual([]);
  });
});

describe("friendlyError", () => {
  it("prefers an explicit code over substring matching", () => {
    const err = Object.assign(new Error("23503: some raw postgres text"), { code: "has_records" });
    expect(friendlyError(err)).toBe(MESSAGES.has_records);
  });

  it("matches longest key first so a short code cannot shadow a longer one", () => {
    // `not_found` is a substring of nothing here, but `not_checkin_able` contains no shorter
    // key either way; the real hazard is a message containing several codes.
    expect(friendlyError(new Error("not_checkin_able"))).toBe(MESSAGES.not_checkin_able);
    expect(friendlyError(new Error("too_early_to_check_in"))).toBe(MESSAGES.too_early_to_check_in);
  });

  it("falls back to recognisable Postgres text when no code is present", () => {
    expect(friendlyError(new Error("new row violates row-level security policy"))).toBe(
      "You don't have permission to do that.",
    );
    expect(friendlyError(new Error("duplicate key value violates unique constraint \"x_slug_key\""))).toBe(
      "That web address is already taken. Try another.",
    );
  });

  it("strips the error: prefix rather than showing it to a user", () => {
    expect(friendlyError(new Error("error: something unmapped"))).toBe("something unmapped");
  });
});

describe("ApiError", () => {
  it("renders the prose for a known code", () => {
    const err = new ApiError({ code: "slot_unavailable", status: 409 });
    expect(err.message).toBe(MESSAGES.slot_unavailable);
    expect(err.code).toBe("slot_unavailable");
    expect(err.status).toBe(409);
  });

  it("never leaves a user looking at a bare machine code for an emittable code", () => {
    for (const code of [...PROCEDURE_CODES, "rate_limited", "brand_not_found", "token_expired"]) {
      const err = new ApiError({ code, status: 400 });
      expect(err.message, `${code} has no prose`).not.toBe(code);
    }
  });

  it("falls back to the status when the payload carries no code", () => {
    const err = new ApiError({ status: 503 });
    expect(err.code).toBe("internal_error");
    expect(err.status).toBe(503);
  });

  it("carries the request id through for support correlation", () => {
    const err = new ApiError({ code: "forbidden", status: 403, request_id: "abc123" });
    expect(err.requestId).toBe("abc123");
  });
});
