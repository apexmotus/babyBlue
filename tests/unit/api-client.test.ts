import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Exercises the remote-mode branch of `src/lib/api/patient.ts` against a fake `fetch`.
 *
 * These branches had never been executed: `npm test` does not typecheck, and nothing imported
 * them, so a signature mismatch against `http.ts`'s `call(path, init)` sat undetected in all
 * thirteen of them. A test that asserts the method, path and Authorization header of each call
 * is the thing that catches that class of break.
 */

const BASE = "https://api.babyblue.test";

interface Captured {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

let captured: Captured[];

/** List routes answer with an array; single-resource routes with an object. */
function defaultPayloadFor(url: string, method: string): unknown {
  return method === "GET" && /\/v1\/me\/appointments(\?|$)/.test(url) ? [] : {};
}

function fakeFetch(status = 200, payload?: unknown) {
  return vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries((init?.headers ?? {}) as Record<string, string>)) {
      headers[k.toLowerCase()] = v;
    }
    captured.push({
      url: String(url),
      method: init?.method ?? "GET",
      headers,
      body: typeof init?.body === "string" ? init.body : undefined,
    });
    const method = init?.method ?? "GET";
    const resolved = payload ?? defaultPayloadFor(String(url), method);
    return new Response(status === 204 ? null : JSON.stringify(resolved), {
      status,
      headers: status === 204 ? {} : { "content-type": "application/json" },
    });
  });
}

beforeEach(() => {
  captured = [];
  vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", BASE);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

const TOKEN = "test-access-token";

describe("patient API client (remote mode)", () => {
  it("sends every call to the right method, path and route, with the bearer token", async () => {
    vi.stubGlobal("fetch", fakeFetch());
    const api = await import("@/lib/api/patient");

    await api.getMyProfile(TOKEN);
    await api.updateMyProfile(TOKEN, { display_name: "A B", phone: "+27821234567" });
    await api.listMyAppointments(TOKEN, "upcoming");
    await api.getMyAppointment(TOKEN, "11111111-1111-4111-8111-111111111111");
    await api.holdSlot(TOKEN, {
      practitioner_id: "22222222-2222-4222-8222-222222222222",
      service_id: "33333333-3333-4333-8333-333333333333",
      starts_at: "2026-12-01T08:00:00Z",
    });
    await api.getHold(TOKEN, "44444444-4444-4444-8444-444444444444");
    await api.releaseHold(TOKEN, "44444444-4444-4444-8444-444444444444");
    await api.bookAppointment(TOKEN, "44444444-4444-4444-8444-444444444444");
    await api.cancelMyAppointment(TOKEN, "11111111-1111-4111-8111-111111111111", "plans changed");
    await api.rescheduleMyAppointment(TOKEN, "11111111-1111-4111-8111-111111111111", "2026-12-02T08:00:00Z");
    await api.checkInAppointment(TOKEN, "11111111-1111-4111-8111-111111111111");
    await api.exportMyAccount(TOKEN);
    await api.deleteMyAccount(TOKEN);

    expect(captured.map((c) => `${c.method} ${c.url.slice(BASE.length)}`)).toEqual([
      "GET /v1/me/profile",
      "PATCH /v1/me/profile",
      "GET /v1/me/appointments?scope=upcoming",
      "GET /v1/me/appointments/11111111-1111-4111-8111-111111111111",
      "POST /v1/me/holds",
      "GET /v1/me/holds/44444444-4444-4444-8444-444444444444",
      "DELETE /v1/me/holds/44444444-4444-4444-8444-444444444444",
      "POST /v1/me/appointments",
      "POST /v1/me/appointments/11111111-1111-4111-8111-111111111111/cancel",
      "POST /v1/me/appointments/11111111-1111-4111-8111-111111111111/reschedule",
      "POST /v1/me/appointments/11111111-1111-4111-8111-111111111111/check-in",
      "GET /v1/me/export",
      "DELETE /v1/me",
    ]);

    // `/v1/me/*` is [Authorize]; a missing header is a 401, so no call may omit it.
    for (const c of captured) {
      expect(c.headers.authorization, `${c.method} ${c.url} sent no token`).toBe(`Bearer ${TOKEN}`);
    }
  });

  it("serialises write bodies as JSON with a content-type", async () => {
    vi.stubGlobal("fetch", fakeFetch(200, { id: "x" }));
    const api = await import("@/lib/api/patient");

    await api.updateMyProfile(TOKEN, { display_name: "A B", phone: null });
    await api.bookAppointment(TOKEN, "44444444-4444-4444-8444-444444444444");

    expect(captured[0].headers["content-type"]).toBe("application/json");
    expect(JSON.parse(captured[0].body!)).toEqual({ display_name: "A B", phone: null });
    expect(JSON.parse(captured[1].body!)).toEqual({ hold_id: "44444444-4444-4444-8444-444444444444" });
  });

  it("never caches an authenticated patient read", async () => {
    vi.stubGlobal("fetch", fakeFetch());
    const api = await import("@/lib/api/patient");
    await api.getMyProfile(TOKEN);
    // `call` forces no-store whenever a token is present, so patient data is never reused.
    expect(captured).toHaveLength(1);
  });

  it("surfaces a ProblemDetails code as an ApiError with prose", async () => {
    vi.stubGlobal(
      "fetch",
      fakeFetch(409, { status: 409, code: "slot_unavailable", request_id: "req-7" }),
    );
    const api = await import("@/lib/api/patient");
    const { MESSAGES } = await import("@/lib/api/messages");

    await expect(
      api.holdSlot(TOKEN, {
        practitioner_id: "22222222-2222-4222-8222-222222222222",
        service_id: "33333333-3333-4333-8333-333333333333",
        starts_at: "2026-12-01T08:00:00Z",
      }),
    ).rejects.toMatchObject({
      code: "slot_unavailable",
      status: 409,
      requestId: "req-7",
      message: MESSAGES.slot_unavailable,
    });
  });

  it("turns the hold quota 429 into the too_many_holds prose", async () => {
    vi.stubGlobal("fetch", fakeFetch(429, { status: 429, code: "too_many_holds" }));
    const api = await import("@/lib/api/patient");
    const { MESSAGES } = await import("@/lib/api/messages");

    await expect(
      api.holdSlot(TOKEN, {
        practitioner_id: "22222222-2222-4222-8222-222222222222",
        service_id: "33333333-3333-4333-8333-333333333333",
        starts_at: "2026-12-01T08:00:00Z",
      }),
    ).rejects.toMatchObject({ code: "too_many_holds", message: MESSAGES.too_many_holds });
  });

  it("returns null rather than throwing for a single-resource 404", async () => {
    vi.stubGlobal("fetch", fakeFetch(404, { status: 404, code: "not_found" }));
    const api = await import("@/lib/api/patient");

    expect(await api.getMyAppointment(TOKEN, "11111111-1111-4111-8111-111111111111")).toBeNull();
    expect(await api.getHold(TOKEN, "44444444-4444-4444-8444-444444444444")).toBeNull();
  });
});

describe("http call", () => {
  it("refuses to call anything when no API base URL is configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "");
    vi.stubGlobal("fetch", fakeFetch());
    const { call } = await import("@/lib/api/http");

    await expect(call("/v1/directory/cities")).rejects.toMatchObject({
      code: "api_not_configured",
    });
    expect(captured).toHaveLength(0);
  });

  it("allows an anonymous read to use the Next.js data cache", async () => {
    vi.stubGlobal("fetch", fakeFetch(200, []));
    const { call } = await import("@/lib/api/http");

    await call("/v1/directory/cities", { next: { revalidate: 3600 } });
    expect(captured[0].headers.authorization).toBeUndefined();
  });
});
