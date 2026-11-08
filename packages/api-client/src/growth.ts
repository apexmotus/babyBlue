import { call, hasRemoteApi, type ApiCallInit } from "./http";

/**
 * Growth: a practice commissions marketing work, an operator delivers it.
 *
 * Only listing and creating a request are scoped to a practice. Everything else is keyed on the
 * request, because `_require_request_access` resolves the practice from it — an operator is
 * authorised on a request without being a member of the practice that owns it, so a
 * practice-scoped route would imply a membership check that is deliberately not the rule.
 */

function authed(token: string | null, method: string, body?: unknown): ApiCallInit {
  return { method, token, ...(body === undefined ? {} : { body: JSON.stringify(body) }) };
}

async function readList<T>(uid: string | null, path: string, sql: string, params: unknown[]): Promise<T[]> {
  if (hasRemoteApi()) return (await call<T[]>(path, authed(uid, "GET"))) ?? [];
  const { query } = await import("@babyblue/pglite-demo/db");
  return query<T>(uid, sql, params) as Promise<T[]>;
}

async function readOne<T>(uid: string | null, path: string, sql: string, params: unknown[]): Promise<T | null> {
  if (hasRemoteApi()) {
    try {
      return (await call<T>(path, authed(uid, "GET"))) ?? null;
    } catch (e) {
      if ((e as { status?: number }).status === 404) return null;
      throw e;
    }
  }
  const { query } = await import("@babyblue/pglite-demo/db");
  const rows = await query<T>(uid, sql, params);
  return (rows[0] as T) ?? null;
}

async function write(
  uid: string | null,
  method: string,
  path: string,
  body: unknown,
  sql: string,
  params: unknown[],
): Promise<void> {
  if (hasRemoteApi()) {
    await call<void>(path, authed(uid, method, body));
    return;
  }
  const { mutate } = await import("@babyblue/pglite-demo/db");
  await mutate(uid, sql, params);
}

async function writeForId(
  uid: string | null,
  method: string,
  path: string,
  body: unknown,
  sql: string,
  params: unknown[],
): Promise<string> {
  if (hasRemoteApi()) {
    const r = await call<{ id: string }>(path, authed(uid, method, body));
    return r.id;
  }
  const { mutate } = await import("@babyblue/pglite-demo/db");
  const rows = await mutate<{ id: string }>(uid, sql, params);
  return rows[0].id;
}

export type {
  GrowthServicesListRow as GrowthServiceRow,
  GrowthRequestsListRow as GrowthRequestRow,
  GrowthRequestGetRow as GrowthRequestDetailRow,
  GrowthUpdatesListRow as GrowthUpdateRow,
  GrowthApprovalsListRow as GrowthApprovalRow,
  GrowthAssetsListRow as GrowthAssetRow,
  GrowthReportsListRow as GrowthReportRow,
  GrowthInboxRow,
} from "./rows.generated";

import type {
  GrowthServicesListRow,
  GrowthRequestsListRow,
  GrowthRequestGetRow,
  GrowthUpdatesListRow,
  GrowthApprovalsListRow,
  GrowthAssetsListRow,
  GrowthReportsListRow,
  GrowthInboxRow,
} from "./rows.generated";

export type MarketingStatus =
  | "draft" | "submitted" | "in_review" | "proposal_sent" | "approved"
  | "in_progress" | "awaiting_approval" | "delivered" | "closed" | "declined";

export const listServices = (uid: string | null) =>
  readList<GrowthServicesListRow>(uid, "/v1/growth/services", "select * from public.growth_services_list()", []);

export const listRequests = (uid: string | null, practiceId: string) =>
  readList<GrowthRequestsListRow>(
    uid,
    `/v1/practices/${practiceId}/growth/requests`,
    "select * from public.growth_requests_list($1)",
    [practiceId],
  );

export const createRequest = (
  uid: string | null,
  practiceId: string,
  body: {
    service_id: string;
    title: string;
    brief: string;
    budget_min_cents?: number | null;
    budget_max_cents?: number | null;
    deadline?: string | null;
  },
) =>
  writeForId(
    uid,
    "POST",
    `/v1/practices/${practiceId}/growth/requests`,
    body,
    "select public.growth_request_create($1, $2, $3, $4, $5, $6, $7::date) as id",
    [
      practiceId,
      body.service_id,
      body.title,
      body.brief,
      body.budget_min_cents ?? null,
      body.budget_max_cents ?? null,
      body.deadline ?? null,
    ],
  );

export const getRequest = (uid: string | null, requestId: string) =>
  readOne<GrowthRequestGetRow>(
    uid,
    `/v1/growth/requests/${requestId}`,
    "select * from public.growth_request_get($1)",
    [requestId],
  );

/**
 * Advance a request. The procedure holds an eight-way state machine that decides both which
 * transition is legal and which side may make it, so an illegal move — or a legal move attempted
 * by the wrong party — comes back as `invalid_transition`.
 */
export const setRequestStatus = (uid: string | null, requestId: string, status: MarketingStatus) =>
  write(
    uid,
    "PUT",
    `/v1/growth/requests/${requestId}/status`,
    { status },
    "select public.growth_request_status_set($1, $2::public.marketing_status)",
    [requestId, status],
  );

export const listUpdates = (uid: string | null, requestId: string) =>
  readList<GrowthUpdatesListRow>(
    uid,
    `/v1/growth/requests/${requestId}/updates`,
    "select * from public.growth_updates_list($1)",
    [requestId],
  );

export const postUpdate = (uid: string | null, requestId: string, body: string) =>
  writeForId(
    uid,
    "POST",
    `/v1/growth/requests/${requestId}/updates`,
    { body },
    "select public.growth_update_post($1, $2) as id",
    [requestId, body],
  );

export const listApprovals = (uid: string | null, requestId: string) =>
  readList<GrowthApprovalsListRow>(
    uid,
    `/v1/growth/requests/${requestId}/approvals`,
    "select * from public.growth_approvals_list($1)",
    [requestId],
  );

export const addApproval = (uid: string | null, requestId: string, item: string) =>
  writeForId(
    uid,
    "POST",
    `/v1/growth/requests/${requestId}/approvals`,
    { item },
    "select public.growth_approval_add($1, $2) as id",
    [requestId, item],
  );

/** Routed on the approval alone: the procedure resolves the request and practice from it. */
export const decideApproval = (
  uid: string | null,
  approvalId: string,
  status: "approved" | "changes_requested",
  comment?: string | null,
) =>
  write(
    uid,
    "POST",
    `/v1/growth/approvals/${approvalId}/decide`,
    { status, comment: comment ?? null },
    "select public.growth_approval_decide($1, $2, $3)",
    [approvalId, status, comment ?? null],
  );

export const listAssets = (uid: string | null, requestId: string) =>
  readList<GrowthAssetsListRow>(
    uid,
    `/v1/growth/requests/${requestId}/assets`,
    "select * from public.growth_assets_list($1)",
    [requestId],
  );

/**
 * Upload an asset as `multipart/form-data`.
 *
 * The declared size is never sent: the API computes it from the bytes it actually read, and the
 * database guards on `octet_length(p_content)` (F-13). A practice owner may attach a
 * `brief_asset`; only a marketing operator may attach a `deliverable`.
 */
export async function addAsset(
  uid: string | null,
  requestId: string,
  file: File,
  kind: "brief_asset" | "deliverable",
): Promise<string> {
  if (hasRemoteApi()) {
    const form = new FormData();
    form.append("file", file);
    form.append("kind", kind);
    const r = await call<{ id: string }>(`/v1/growth/requests/${requestId}/assets`, {
      method: "POST",
      token: uid,
      body: form,
    });
    return r.id;
  }

  const { mutate } = await import("@babyblue/pglite-demo/db");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const rows = await mutate<{ id: string }>(
    uid,
    "select public.growth_asset_add($1, $2, $3, $4, $5, $6) as id",
    [requestId, kind, file.name, file.type || "application/octet-stream", bytes.length, bytes],
  );
  return rows[0].id;
}

/** The API serves this as an attachment with `nosniff`; never render it inline. */
export function assetDownloadUrl(requestIdOrAssetId: string): string {
  return `/v1/growth/assets/${requestIdOrAssetId}/content`;
}

export const listReports = (uid: string | null, requestId: string) =>
  readList<GrowthReportsListRow>(
    uid,
    `/v1/growth/requests/${requestId}/reports`,
    "select * from public.growth_reports_list($1)",
    [requestId],
  );

export const createReport = (
  uid: string | null,
  requestId: string,
  body: { period: string; summary: string; metrics?: Record<string, number> | null },
) =>
  writeForId(
    uid,
    "POST",
    `/v1/growth/requests/${requestId}/reports`,
    body,
    "select public.growth_report_create($1, $2, $3, $4::jsonb) as id",
    [requestId, body.period, body.summary, body.metrics ? JSON.stringify(body.metrics) : null],
  );

/** The marketing operator's queue. `403` for anyone who is not one. */
export const getInbox = (uid: string | null, status?: string | null) =>
  readList<GrowthInboxRow>(
    uid,
    `/v1/growth/inbox${status ? `?status=${encodeURIComponent(status)}` : ""}`,
    "select * from public.growth_inbox($1)",
    [status ?? null],
  );
