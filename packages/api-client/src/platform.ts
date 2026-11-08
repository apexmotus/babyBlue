import { call, hasRemoteApi, type ApiCallInit } from "./http";

/**
 * Platform administration.
 *
 * Nothing here checks whether the caller is an admin. `is_platform_admin()` inside each procedure
 * is the authority, so a non-admin gets `403` from the database rather than from a check in the
 * browser that could be edited out.
 */

function authed(token: string | null, method: string, body?: unknown): ApiCallInit {
  return { method, token, ...(body === undefined ? {} : { body: JSON.stringify(body) }) };
}

export type { PlatformOverviewRow, PlatformAuditLogRow } from "./rows.generated";
import type { PlatformOverviewRow, PlatformAuditLogRow } from "./rows.generated";

export const getOverview = async (uid: string | null): Promise<PlatformOverviewRow[]> => {
  if (hasRemoteApi()) {
    return (await call<PlatformOverviewRow[]>("/v1/platform/overview", authed(uid, "GET"))) ?? [];
  }
  const { query } = await import("@babyblue/pglite-demo/db");
  return query<PlatformOverviewRow>(uid, "select * from public.platform_overview()");
};

/**
 * The audit log, paged by keyset.
 *
 * `before` is the oldest `at` already seen. On a log that only grows, offset paging re-reads and
 * discards everything above the offset — so later pages get slower as the log fills, and entries
 * written mid-pagination shift the window and cause rows to be skipped or repeated.
 */
export const getAuditLog = async (
  uid: string | null,
  opts: { practiceId?: string | null; limit?: number; before?: Date | null } = {},
): Promise<PlatformAuditLogRow[]> => {
  const { practiceId = null, limit = 100, before = null } = opts;

  if (hasRemoteApi()) {
    const qs = new URLSearchParams({ limit: String(limit) });
    if (practiceId) qs.set("practice", practiceId);
    if (before) qs.set("before", before.toISOString());
    return (await call<PlatformAuditLogRow[]>(`/v1/platform/audit-log?${qs}`, authed(uid, "GET"))) ?? [];
  }

  const { query } = await import("@babyblue/pglite-demo/db");
  return query<PlatformAuditLogRow>(
    uid,
    "select * from public.platform_audit_log($1, $2, $3::timestamptz)",
    [practiceId, limit, before?.toISOString() ?? null],
  );
};

export const grantRole = async (
  uid: string | null,
  body: { email: string; role: "platform_admin" | "marketing_operator" },
): Promise<void> => {
  if (hasRemoteApi()) {
    await call<void>("/v1/platform/roles", authed(uid, "POST", body));
    return;
  }
  const { mutate } = await import("@babyblue/pglite-demo/db");
  await mutate(uid, "select public.platform_role_grant($1, $2::public.platform_role)", [body.email, body.role]);
};

export const setPracticeStatus = async (
  uid: string | null,
  practiceId: string,
  status: "pending" | "active" | "suspended",
  reason?: string | null,
): Promise<void> => {
  if (hasRemoteApi()) {
    await call<void>(`/v1/platform/practices/${practiceId}/status`, authed(uid, "PUT", { status, reason: reason ?? null }));
    return;
  }
  const { mutate } = await import("@babyblue/pglite-demo/db");
  await mutate(uid, "select public.platform_practice_status_set($1, $2, $3)", [practiceId, status, reason ?? null]);
};

/** D-06: the verified badge is the platform's to award, never the practice's. */
export const setVerification = async (
  uid: string | null,
  practitionerId: string,
  status: "unverified" | "pending" | "verified" | "rejected",
  note?: string | null,
): Promise<void> => {
  if (hasRemoteApi()) {
    await call<void>(`/v1/platform/practitioners/${practitionerId}/verification`, authed(uid, "PUT", { status, note: note ?? null }));
    return;
  }
  const { mutate } = await import("@babyblue/pglite-demo/db");
  await mutate(uid, "select public.platform_verification_set($1, $2, $3)", [practitionerId, status, note ?? null]);
};
