import { call, hasRemoteApi, type ApiCallInit } from "./http";

/**
 * The Practice OS data layer.
 *
 * Every function here calls exactly one stored procedure, through the API when one is configured
 * and through the browser database otherwise. Both branches call the *same* procedure, which is
 * what makes this a swap rather than two implementations: the demo database has all 106 too.
 *
 * What this replaces matters more than what it adds. The OS screens previously wrote raw SQL
 * against `practitioners`, `services`, `clients`, `availability_rules`, `time_off` and
 * `practices` from the browser, which is why `anon` and `authenticated` still hold table grants.
 * Those writes are gone, so nothing in the product needs them any more and
 * `IMPLEMENTATION_PLAN.md` Stage 5 can revoke them.
 *
 * The `uid` parameter is the browser database's actor in demo mode and the access token in remote
 * mode, matching the convention in `./public.ts` and `./patient.ts`.
 */

// ---------------------------------------------------------------------------- plumbing

function authed(token: string | null, method: string, body?: unknown): ApiCallInit {
  return {
    method,
    token,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  };
}

/** A list read: the API returns an array, the procedure returns rows. */
async function readList<T>(
  uid: string | null,
  path: string,
  sql: string,
  params: unknown[],
): Promise<T[]> {
  if (hasRemoteApi()) {
    return (await call<T[]>(path, authed(uid, "GET"))) ?? [];
  }
  const { query } = await import("@/local/db");
  return query<T>(uid, sql, params) as Promise<T[]>;
}

/** A single-resource read. Returns null where the procedure returns no row. */
async function readOne<T>(
  uid: string | null,
  path: string,
  sql: string,
  params: unknown[],
): Promise<T | null> {
  if (hasRemoteApi()) {
    try {
      return (await call<T>(path, authed(uid, "GET"))) ?? null;
    } catch (e) {
      if ((e as { status?: number }).status === 404) return null;
      throw e;
    }
  }
  const { query } = await import("@/local/db");
  const rows = await query<T>(uid, sql, params);
  return (rows[0] as T) ?? null;
}

/** A scalar read, e.g. a `jsonb` document or a count. */
async function readScalar<T>(
  uid: string | null,
  path: string,
  sql: string,
  params: unknown[],
  unwrap: (row: Record<string, unknown>) => T,
): Promise<T> {
  if (hasRemoteApi()) {
    return (await call<T>(path, authed(uid, "GET")))!;
  }
  const { query } = await import("@/local/db");
  const rows = await query<Record<string, unknown>>(uid, sql, params);
  return unwrap(rows[0] ?? {});
}

/** A state change with no response body. */
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
  const { mutate } = await import("@/local/db");
  await mutate(uid, sql, params);
}

/** A write that returns the affected row's identifier. */
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
  const { mutate } = await import("@/local/db");
  const rows = await mutate<{ id: string }>(uid, sql, params);
  return rows[0].id;
}

// ---------------------------------------------------------------------------- row types

export type PracticeRole = "practice_owner" | "practitioner" | "receptionist" | "staff";
export type ListingStatus = "listed" | "unlisted";
export type VerificationStatus = "unverified" | "pending" | "verified" | "rejected";

/**
 * Row shapes come from `./rows.generated.ts`, emitted by `BabyBlue.ContractGen` from the same
 * `pg_proc` catalogue as the C# contracts. They were hand-written first, and 16 of 24 had drifted
 * within an hour — naming columns the procedures do not return, or omitting ones they do. Each of
 * those is a silent `undefined` at runtime rather than a compile error, which is precisely the
 * drift D-26 removed from the TypeScript side and §6 removed from the C# side.
 *
 * The aliases below keep the short names the screens already use.
 */
export type {
  PracticeAppointmentGetRow as AppointmentDetailRow,
  PracticeAppointmentHistoryRow as AppointmentHistoryRow,
  PracticeAppointmentSlotsRow as SlotRow,
  PracticeAvailabilityListRow as AvailabilityRow,
  PracticeCalendarAppointmentsRow as CalendarAppointmentRow,
  PracticeCalendarAvailabilityRow as CalendarAvailabilityRow,
  PracticeCalendarTimeoffRow as CalendarTimeOffRow,
  PracticeClientConsentsListRow as ConsentEventRow,
  PracticeClientGetRow as ClientDetailRow,
  PracticeClientSearchRow as ClientSearchRow,
  PracticeClientsListRow as ClientListRow,
  PracticeLocationsListRow as LocationRow,
  PracticeMembershipsListRow as MembershipRow,
  PracticePractitionersListRow as PractitionerRow,
  PracticeQueueListRow as QueueEntryRow,
  PracticeQueuePreviewRow as QueuePreviewRow,
  PracticeRecentAppBookingsRow as RecentAppBookingRow,
  PracticeRegistrationsListRow as RegistrationRow,
  PracticeServicesListRow as ServiceRow,
  PracticeSettingsGetRow as SettingsRow,
  PracticeSetupProgressRow as SetupProgressRow,
  PracticeTeamListRow as TeamMemberRow,
  PracticeTimeoffListRow as TimeOffRow,
  PracticeVerificationsListRow as VerificationRow,
} from "./rows.generated";

import type {
  PracticeAppointmentGetRow,
  PracticeAppointmentHistoryRow,
  PracticeAppointmentSlotsRow,
  PracticeAvailabilityListRow,
  PracticeCalendarAppointmentsRow,
  PracticeCalendarAvailabilityRow,
  PracticeCalendarTimeoffRow,
  PracticeClientConsentsListRow,
  PracticeClientGetRow,
  PracticeClientSearchRow,
  PracticeClientsListRow,
  PracticeLocationsListRow,
  PracticeMembershipsListRow,
  PracticePractitionersListRow,
  PracticeQueueListRow,
  PracticeQueuePreviewRow,
  PracticeRecentAppBookingsRow,
  PracticeRegistrationsListRow,
  PracticeServicesListRow,
  PracticeSettingsGetRow,
  PracticeSetupProgressRow,
  PracticeTeamListRow,
  PracticeTimeoffListRow,
  PracticeVerificationsListRow,
} from "./rows.generated";

type AppointmentDetailRow = PracticeAppointmentGetRow;
type AppointmentHistoryRow = PracticeAppointmentHistoryRow;
type AvailabilityRow = PracticeAvailabilityListRow;
type CalendarAppointmentRow = PracticeCalendarAppointmentsRow;
type CalendarAvailabilityRow = PracticeCalendarAvailabilityRow;
type CalendarTimeOffRow = PracticeCalendarTimeoffRow;
type ClientDetailRow = PracticeClientGetRow;
type ClientListRow = PracticeClientsListRow;
type ClientSearchRow = PracticeClientSearchRow;
type ConsentEventRow = PracticeClientConsentsListRow;
type LocationRow = PracticeLocationsListRow;
type MembershipRow = PracticeMembershipsListRow;
type PractitionerRow = PracticePractitionersListRow;
type QueueEntryRow = PracticeQueueListRow;
type QueuePreviewRow = PracticeQueuePreviewRow;
type RecentAppBookingRow = PracticeRecentAppBookingsRow;
type RegistrationRow = PracticeRegistrationsListRow;
type ServiceRow = PracticeServicesListRow;
type SettingsRow = PracticeSettingsGetRow;
type SetupProgressRow = PracticeSetupProgressRow;
type SlotRow = PracticeAppointmentSlotsRow;
type TeamMemberRow = PracticeTeamListRow;
type TimeOffRow = PracticeTimeoffListRow;
type VerificationRow = PracticeVerificationsListRow;

/** The dashboard and insights documents are `jsonb`, returned verbatim (API_LAYER_SPEC §15). */
export type DashboardDoc = Record<string, unknown>;
export type InsightsDoc = Record<string, unknown>;

// ---------------------------------------------------------------------------- context

export const listMemberships = (uid: string | null) =>
  readList<MembershipRow>(uid, "/v1/practices", "select * from public.practice_memberships_list()", []);

/** The caller's own platform role, or null. Open to every signed-in user. */
export async function getPlatformRole(uid: string | null): Promise<string | null> {
  if (hasRemoteApi()) {
    const r = await call<{ role: string | null }>("/v1/me/platform-role", authed(uid, "GET"));
    return r?.role ?? null;
  }
  const { query } = await import("@/local/db");
  const rows = await query<{ role: string | null }>(uid, "select public.platform_my_role() as role");
  return rows[0]?.role ?? null;
}

export const getDashboard = (uid: string | null, practiceId: string) =>
  readScalar<DashboardDoc>(
    uid,
    `/v1/practices/${practiceId}/dashboard`,
    "select public.practice_dashboard_get($1) as doc",
    [practiceId],
    (r) => (r.doc as DashboardDoc) ?? {},
  );

export const getInsights = (uid: string | null, practiceId: string, weeks = 12) =>
  readScalar<InsightsDoc>(
    uid,
    `/v1/practices/${practiceId}/insights?weeks=${weeks}`,
    "select public.practice_insights_get($1, $2) as doc",
    [practiceId, weeks],
    (r) => (r.doc as InsightsDoc) ?? {},
  );

export const getSetupProgress = (uid: string | null, practiceId: string) =>
  readOne<SetupProgressRow>(
    uid,
    `/v1/practices/${practiceId}/setup-progress`,
    "select * from public.practice_setup_progress($1)",
    [practiceId],
  );

export const getQueuePreview = (uid: string | null, practiceId: string, limit = 5) =>
  readList<QueuePreviewRow>(
    uid,
    `/v1/practices/${practiceId}/queue/preview?limit=${limit}`,
    "select * from public.practice_queue_preview($1, $2)",
    [practiceId, limit],
  );

export async function getQueueWaitingCount(uid: string | null, practiceId: string): Promise<number> {
  if (hasRemoteApi()) {
    const r = await call<{ count: number }>(
      `/v1/practices/${practiceId}/queue/waiting-count`,
      authed(uid, "GET"),
    );
    return Number(r?.count ?? 0);
  }
  const { query } = await import("@/local/db");
  const rows = await query<{ count: number }>(
    uid,
    "select public.practice_queue_waiting_count($1) as count",
    [practiceId],
  );
  return Number(rows[0]?.count ?? 0);
}

export const getRecentAppBookings = (uid: string | null, practiceId: string, days = 7, limit = 10) =>
  readList<RecentAppBookingRow>(
    uid,
    `/v1/practices/${practiceId}/bookings/recent?days=${days}&limit=${limit}`,
    "select * from public.practice_recent_app_bookings($1, $2, $3)",
    [practiceId, days, limit],
  );

/** Z-suffixed UTC: an unencoded "+" in a query value decodes to a space and never parses. */
const utc = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, "Z");

export const listCalendarAppointments = (
  uid: string | null,
  practiceId: string,
  from: Date,
  to: Date,
  includeCancelled = false,
) =>
  readList<CalendarAppointmentRow>(
    uid,
    `/v1/practices/${practiceId}/calendar/appointments?from=${utc(from)}&to=${utc(to)}&include_cancelled=${includeCancelled}`,
    "select * from public.practice_calendar_appointments($1, $2::timestamptz, $3::timestamptz, $4)",
    [practiceId, from.toISOString(), to.toISOString(), includeCancelled],
  );

export const listCalendarAvailability = (uid: string | null, practiceId: string) =>
  readList<CalendarAvailabilityRow>(
    uid,
    `/v1/practices/${practiceId}/calendar/availability`,
    "select * from public.practice_calendar_availability($1)",
    [practiceId],
  );

export const listCalendarTimeOff = (uid: string | null, practiceId: string, from: Date, to: Date) =>
  readList<CalendarTimeOffRow>(
    uid,
    `/v1/practices/${practiceId}/calendar/time-off?from=${utc(from)}&to=${utc(to)}`,
    "select * from public.practice_calendar_timeoff($1, $2::timestamptz, $3::timestamptz)",
    [practiceId, from.toISOString(), to.toISOString()],
  );

// ---------------------------------------------------------------------------- team

export const listPractitioners = (uid: string | null, practiceId: string) =>
  readList<PractitionerRow>(
    uid,
    `/v1/practices/${practiceId}/practitioners`,
    "select * from public.practice_practitioners_list($1)",
    [practiceId],
  );

export const createPractitioner = (
  uid: string | null,
  practiceId: string,
  body: {
    display_name: string;
    title?: string | null;
    speciality_slug?: string | null;
    bio?: string | null;
    languages?: string[] | null;
    user_id?: string | null;
  },
) =>
  writeForId(
    uid,
    "POST",
    `/v1/practices/${practiceId}/practitioners`,
    body,
    "select public.practice_practitioner_create($1, $2, $3, $4, $5, $6, $7) as id",
    [
      practiceId,
      body.display_name,
      body.title ?? null,
      body.speciality_slug ?? null,
      body.bio ?? "",
      body.languages ?? ["English"],
      body.user_id ?? null,
    ],
  );

export const updatePractitioner = (
  uid: string | null,
  practiceId: string,
  practitionerId: string,
  body: {
    display_name?: string | null;
    title?: string | null;
    speciality_slug?: string | null;
    bio?: string | null;
    languages?: string[] | null;
    listing_status?: ListingStatus | null;
  },
) =>
  write(
    uid,
    "PATCH",
    `/v1/practices/${practiceId}/practitioners/${practitionerId}`,
    body,
    "select public.practice_practitioner_update($1, $2, $3, $4, $5, $6, $7, $8)",
    [
      practiceId,
      practitionerId,
      body.display_name ?? null,
      body.title ?? null,
      body.speciality_slug ?? null,
      body.bio ?? null,
      body.languages ?? null,
      body.listing_status ?? null,
    ],
  );

export const listPractitionerServices = (uid: string | null, practiceId: string, practitionerId: string) =>
  readList<{ service_id: string; name: string }>(
    uid,
    `/v1/practices/${practiceId}/practitioners/${practitionerId}/services`,
    "select * from public.practice_practitioner_services_list($1, $2)",
    [practiceId, practitionerId],
  );

export const setPractitionerServices = (
  uid: string | null,
  practiceId: string,
  practitionerId: string,
  serviceIds: string[],
) =>
  write(
    uid,
    "PUT",
    `/v1/practices/${practiceId}/practitioners/${practitionerId}/services`,
    { service_ids: serviceIds },
    "select public.practice_practitioner_services_set($1, $2, $3::uuid[])",
    [practiceId, practitionerId, serviceIds],
  );

export const listRegistrations = (uid: string | null, practiceId: string, practitionerId: string) =>
  readList<RegistrationRow>(
    uid,
    `/v1/practices/${practiceId}/practitioners/${practitionerId}/registrations`,
    "select * from public.practice_registrations_list($1, $2)",
    [practiceId, practitionerId],
  );

export const submitRegistration = (
  uid: string | null,
  practiceId: string,
  practitionerId: string,
  body: { body_code: string; number: string },
) =>
  write(
    uid,
    "POST",
    `/v1/practices/${practiceId}/practitioners/${practitionerId}/registrations`,
    body,
    "select public.practice_registration_submit($1, $2, $3, $4)",
    [practiceId, practitionerId, body.body_code, body.number],
  );

export const listVerifications = (uid: string | null, practiceId: string, practitionerId: string) =>
  readList<VerificationRow>(
    uid,
    `/v1/practices/${practiceId}/practitioners/${practitionerId}/verifications`,
    "select * from public.practice_verifications_list($1, $2)",
    [practiceId, practitionerId],
  );

export const listMembers = (uid: string | null, practiceId: string) =>
  readList<TeamMemberRow>(
    uid,
    `/v1/practices/${practiceId}/members`,
    "select * from public.practice_team_list($1)",
    [practiceId],
  );

export const addMember = (uid: string | null, practiceId: string, body: { email: string; role: PracticeRole }) =>
  writeForId(
    uid,
    "POST",
    `/v1/practices/${practiceId}/members`,
    body,
    "select public.practice_member_add($1, $2, $3::public.practice_role) as id",
    [practiceId, body.email, body.role],
  );

export const setMemberRole = (uid: string | null, practiceId: string, userId: string, role: PracticeRole) =>
  write(
    uid,
    "PUT",
    `/v1/practices/${practiceId}/members/${userId}/role`,
    { role },
    "select public.practice_member_role_set($1, $2, $3::public.practice_role)",
    [practiceId, userId, role],
  );

export const removeMember = (uid: string | null, practiceId: string, userId: string) =>
  write(
    uid,
    "DELETE",
    `/v1/practices/${practiceId}/members/${userId}`,
    undefined,
    "select public.practice_member_remove($1, $2)",
    [practiceId, userId],
  );

// ---------------------------------------------------------------------------- services

export const listServices = (uid: string | null, practiceId: string, includeInactive = true) =>
  readList<ServiceRow>(
    uid,
    `/v1/practices/${practiceId}/services?include_inactive=${includeInactive}`,
    "select * from public.practice_services_list($1, $2)",
    [practiceId, includeInactive],
  );

export const upsertService = (
  uid: string | null,
  practiceId: string,
  body: {
    service_id?: string | null;
    name: string;
    description?: string | null;
    duration_min: number;
    buffer_min: number;
    price_cents?: number | null;
    active: boolean;
  },
) =>
  writeForId(
    uid,
    "PUT",
    `/v1/practices/${practiceId}/services`,
    body,
    "select public.practice_service_upsert($1, $2, $3, $4, $5, $6, $7, $8) as id",
    [
      practiceId,
      body.service_id ?? null,
      body.name,
      body.description ?? null,
      body.duration_min,
      body.buffer_min,
      body.price_cents ?? null,
      body.active,
    ],
  );

export const listServicePractitioners = (uid: string | null, practiceId: string, serviceId: string) =>
  readList<{ practitioner_id: string; display_name: string }>(
    uid,
    `/v1/practices/${practiceId}/services/${serviceId}/practitioners`,
    "select * from public.practice_service_practitioners_list($1, $2)",
    [practiceId, serviceId],
  );

export const setServicePractitioners = (
  uid: string | null,
  practiceId: string,
  serviceId: string,
  practitionerIds: string[],
) =>
  write(
    uid,
    "PUT",
    `/v1/practices/${practiceId}/services/${serviceId}/practitioners`,
    { practitioner_ids: practitionerIds },
    "select public.practice_service_practitioners_set($1, $2, $3::uuid[])",
    [practiceId, serviceId, practitionerIds],
  );

export const deactivateService = (uid: string | null, practiceId: string, serviceId: string) =>
  write(
    uid,
    "POST",
    `/v1/practices/${practiceId}/services/${serviceId}/deactivate`,
    undefined,
    "select public.practice_service_deactivate($1, $2)",
    [practiceId, serviceId],
  );

// ---------------------------------------------------------------------------- availability

export const listAvailability = (uid: string | null, practiceId: string, practitionerId: string) =>
  readList<AvailabilityRow>(
    uid,
    `/v1/practices/${practiceId}/practitioners/${practitionerId}/availability`,
    "select * from public.practice_availability_list($1, $2)",
    [practiceId, practitionerId],
  );

export const setAvailability = (
  uid: string | null,
  practiceId: string,
  practitionerId: string,
  body: { weekdays: number[]; starts: string[]; ends: string[]; location_id?: string | null },
) =>
  write(
    uid,
    "PUT",
    `/v1/practices/${practiceId}/practitioners/${practitionerId}/availability`,
    body,
    "select public.practice_availability_set($1, $2, $3::int[], $4::text[], $5::text[], $6)",
    [practiceId, practitionerId, body.weekdays, body.starts, body.ends, body.location_id ?? null],
  );

export const applyAvailabilityPattern = (
  uid: string | null,
  practiceId: string,
  practitionerId: string,
  body: { weekdays: number[]; start: string; end: string; location_id?: string | null },
) =>
  write(
    uid,
    "POST",
    `/v1/practices/${practiceId}/practitioners/${practitionerId}/availability/pattern`,
    body,
    "select public.practice_availability_apply_pattern($1, $2, $3::int[], $4, $5, $6)",
    [practiceId, practitionerId, body.weekdays, body.start, body.end, body.location_id ?? null],
  );

export const listTimeOff = (uid: string | null, practiceId: string, practitionerId?: string | null, from?: Date) => {
  const qs = new URLSearchParams();
  if (practitionerId) qs.set("practitioner", practitionerId);
  if (from) qs.set("from", utc(from));
  const suffix = qs.size > 0 ? `?${qs}` : "";

  return readList<TimeOffRow>(
    uid,
    `/v1/practices/${practiceId}/time-off${suffix}`,
    "select * from public.practice_timeoff_list($1, $2, $3::timestamptz)",
    [practiceId, practitionerId ?? null, from?.toISOString() ?? null],
  );
};

export const addTimeOff = (
  uid: string | null,
  practiceId: string,
  body: { practitioner_id: string; from: string; to: string; reason?: string | null },
) =>
  writeForId(
    uid,
    "POST",
    `/v1/practices/${practiceId}/time-off`,
    body,
    "select public.practice_timeoff_add($1, $2, $3::date, $4::date, $5) as id",
    [practiceId, body.practitioner_id, body.from, body.to, body.reason ?? null],
  );

export const removeTimeOff = (uid: string | null, practiceId: string, timeOffId: string) =>
  write(
    uid,
    "DELETE",
    `/v1/practices/${practiceId}/time-off/${timeOffId}`,
    undefined,
    "select public.practice_timeoff_remove($1, $2)",
    [practiceId, timeOffId],
  );

// ---------------------------------------------------------------------------- clients

export const listClients = (uid: string | null, practiceId: string, q = "", limit = 50, offset = 0) =>
  readList<ClientListRow>(
    uid,
    `/v1/practices/${practiceId}/clients?q=${encodeURIComponent(q)}&limit=${limit}&offset=${offset}`,
    "select * from public.practice_clients_list($1, $2, $3, $4)",
    [practiceId, q || null, limit, offset],
  );

export const searchClients = (uid: string | null, practiceId: string, q: string, limit = 6) =>
  readList<ClientSearchRow>(
    uid,
    `/v1/practices/${practiceId}/clients/search?q=${encodeURIComponent(q)}&limit=${limit}`,
    "select * from public.practice_client_search($1, $2, $3)",
    [practiceId, q, limit],
  );

export const getClient = (uid: string | null, practiceId: string, clientId: string) =>
  readOne<ClientDetailRow>(
    uid,
    `/v1/practices/${practiceId}/clients/${clientId}`,
    "select * from public.practice_client_get($1, $2)",
    [practiceId, clientId],
  );

export const createClient = (
  uid: string | null,
  practiceId: string,
  body: {
    first_name: string;
    last_name?: string;
    phone?: string | null;
    email?: string | null;
    consent_record_storage?: boolean;
  },
) =>
  writeForId(
    uid,
    "POST",
    `/v1/practices/${practiceId}/clients`,
    body,
    "select public.practice_client_create($1, $2, $3, $4, $5, $6) as id",
    [
      practiceId,
      body.first_name,
      body.last_name ?? "",
      body.phone ?? null,
      body.email ?? null,
      body.consent_record_storage ?? false,
    ],
  );

export const updateClient = (
  uid: string | null,
  practiceId: string,
  clientId: string,
  body: { first_name?: string | null; last_name?: string | null; phone?: string | null; email?: string | null },
) =>
  write(
    uid,
    "PATCH",
    `/v1/practices/${practiceId}/clients/${clientId}`,
    body,
    "select public.practice_client_update($1, $2, $3, $4, $5, $6)",
    [practiceId, clientId, body.first_name ?? null, body.last_name ?? null, body.phone ?? null, body.email ?? null],
  );

export const setClientNotes = (uid: string | null, practiceId: string, clientId: string, notes: string | null) =>
  write(
    uid,
    "PUT",
    `/v1/practices/${practiceId}/clients/${clientId}/notes`,
    { notes },
    "select public.practice_client_notes_set($1, $2, $3)",
    [practiceId, clientId, notes],
  );

export const listConsents = (uid: string | null, practiceId: string, clientId: string) =>
  readList<ConsentEventRow>(
    uid,
    `/v1/practices/${practiceId}/clients/${clientId}/consents`,
    "select * from public.practice_client_consents_list($1, $2)",
    [practiceId, clientId],
  );

export const grantConsent = (
  uid: string | null,
  practiceId: string,
  clientId: string,
  purpose: ConsentEventRow["purpose"],
  evidence?: Record<string, unknown> | null,
) =>
  write(
    uid,
    "POST",
    `/v1/practices/${practiceId}/clients/${clientId}/consents`,
    { purpose, evidence: evidence ?? null },
    "select public.practice_client_consent_grant($1, $2, $3::public.consent_purpose, $4::jsonb)",
    [practiceId, clientId, purpose, evidence ? JSON.stringify(evidence) : null],
  );

/**
 * Withdraw a consent. The grant is not erased: the database appends a withdrawal event, so the
 * series still shows what the practice was permitted to do before this moment (POPIA s11(3)).
 */
export const withdrawConsent = (
  uid: string | null,
  practiceId: string,
  clientId: string,
  purpose: ConsentEventRow["purpose"],
  reason?: string | null,
) =>
  write(
    uid,
    "DELETE",
    `/v1/practices/${practiceId}/clients/${clientId}/consents/${purpose}${reason ? `?reason=${encodeURIComponent(reason)}` : ""}`,
    undefined,
    "select public.practice_client_consent_withdraw($1, $2, $3::public.consent_purpose, $4)",
    [practiceId, clientId, purpose, reason ?? null],
  );

// ---------------------------------------------------------------------------- queue

export const listQueue = (uid: string | null, practiceId: string, windowHours = 12) =>
  readList<QueueEntryRow>(
    uid,
    `/v1/practices/${practiceId}/queue?window_hours=${windowHours}`,
    "select * from public.practice_queue_list($1, $2)",
    [practiceId, windowHours],
  );

export const addWalkIn = (
  uid: string | null,
  practiceId: string,
  body: { name: string; phone?: string | null; urgency?: string; client_id?: string | null },
) =>
  writeForId(
    uid,
    "POST",
    `/v1/practices/${practiceId}/queue/walk-ins`,
    body,
    "select public.practice_queue_walkin_add($1, $2, $3, $4, $5) as id",
    [practiceId, body.name, body.phone ?? null, body.urgency ?? "routine", body.client_id ?? null],
  );

export const setQueueStatus = (uid: string | null, practiceId: string, entryId: string, status: string) =>
  write(
    uid,
    "PUT",
    `/v1/practices/${practiceId}/queue/${entryId}/status`,
    { status },
    "select public.practice_queue_status_set($1, $2, $3::public.queue_status)",
    [practiceId, entryId, status],
  );

/**
 * Claim the next waiting patient. Returns null when the queue is empty.
 *
 * Not idempotent by design: two receptionists pressing the button at the same moment get two
 * different patients, because the procedure uses `for update skip locked`. Never retry it.
 */
export async function callNext(uid: string | null, practiceId: string): Promise<string | null> {
  if (hasRemoteApi()) {
    const r = await call<{ id: string } | undefined>(
      `/v1/practices/${practiceId}/queue/call-next`,
      authed(uid, "POST"),
    );
    return r?.id ?? null;
  }
  const { mutate } = await import("@/local/db");
  const rows = await mutate<{ id: string | null }>(
    uid,
    "select public.practice_queue_call_next($1) as id",
    [practiceId],
  );
  return rows[0]?.id ?? null;
}

export const linkQueueClient = (uid: string | null, practiceId: string, entryId: string, clientId: string) =>
  write(
    uid,
    "PUT",
    `/v1/practices/${practiceId}/queue/${entryId}/client`,
    { client_id: clientId },
    "select public.practice_queue_link_client($1, $2, $3)",
    [practiceId, entryId, clientId],
  );

// ---------------------------------------------------------------------------- appointments

export const getAppointment = (uid: string | null, practiceId: string, appointmentId: string) =>
  readOne<AppointmentDetailRow>(
    uid,
    `/v1/practices/${practiceId}/appointments/${appointmentId}`,
    "select * from public.practice_appointment_get($1, $2)",
    [practiceId, appointmentId],
  );

export const getAppointmentHistory = (uid: string | null, practiceId: string, appointmentId: string) =>
  readList<AppointmentHistoryRow>(
    uid,
    `/v1/practices/${practiceId}/appointments/${appointmentId}/history`,
    "select * from public.practice_appointment_history($1, $2)",
    [practiceId, appointmentId],
  );

/**
 * Book for a client. `consent_required` comes back when the client's latest `record_storage`
 * consent event is absent or withdrawn — the POPIA s11 check staff booking cannot skip.
 */
export const createAppointment = (
  uid: string | null,
  practiceId: string,
  body: {
    practitioner_id: string;
    service_id: string;
    client_id: string;
    starts_at: string;
    source?: "os" | "flow";
    location_id?: string | null;
  },
) =>
  writeForId(
    uid,
    "POST",
    `/v1/practices/${practiceId}/appointments`,
    body,
    "select public.practice_appointment_create($1, $2, $3, $4, $5::timestamptz, $6, $7) as id",
    [
      practiceId,
      body.practitioner_id,
      body.service_id,
      body.client_id,
      body.starts_at,
      body.source ?? "os",
      body.location_id ?? null,
    ],
  );

export const setAppointmentStatus = (
  uid: string | null,
  practiceId: string,
  appointmentId: string,
  status: string,
) =>
  write(
    uid,
    "PUT",
    `/v1/practices/${practiceId}/appointments/${appointmentId}/status`,
    { status },
    "select public.practice_appointment_status_set($1, $2, $3::public.appointment_status)",
    [practiceId, appointmentId, status],
  );

export const cancelAppointment = (
  uid: string | null,
  practiceId: string,
  appointmentId: string,
  reason?: string | null,
) =>
  write(
    uid,
    "POST",
    `/v1/practices/${practiceId}/appointments/${appointmentId}/cancel`,
    { reason: reason ?? null },
    "select public.practice_appointment_cancel($1, $2, $3)",
    [practiceId, appointmentId, reason ?? null],
  );

export const rescheduleAppointment = (
  uid: string | null,
  practiceId: string,
  appointmentId: string,
  newStartsAt: string,
) =>
  write(
    uid,
    "POST",
    `/v1/practices/${practiceId}/appointments/${appointmentId}/reschedule`,
    { new_starts_at: newStartsAt },
    "select public.practice_appointment_reschedule($1, $2, $3::timestamptz)",
    [practiceId, appointmentId, newStartsAt],
  );

export const listAppointmentSlots = (
  uid: string | null,
  practiceId: string,
  practitionerId: string,
  serviceId: string,
  day: string,
) =>
  readList<SlotRow>(
    uid,
    `/v1/practices/${practiceId}/appointments/slots?practitioner=${practitionerId}&service=${serviceId}&day=${day}`,
    "select * from public.practice_appointment_slots($1, $2, $3, $4::date)",
    [practiceId, practitionerId, serviceId, day],
  );

// ---------------------------------------------------------------------------- settings

export const createPractice = (uid: string | null, body: { name: string; slug: string }) =>
  writeForId(
    uid,
    "POST",
    "/v1/practices",
    body,
    "select public.practice_create($1, $2) as id",
    [body.name, body.slug],
  );

/** The whole onboarding wizard in one transaction, so a half-built practice is not a state. */
export const onboardPractice = (
  uid: string | null,
  body: {
    name: string;
    slug: string;
    city_id?: string | null;
    address?: string | null;
    practitioner_name: string;
    title?: string | null;
    speciality_slug?: string | null;
    bio?: string | null;
    languages?: string[] | null;
    service_name: string;
    duration_min: number;
    buffer_min: number;
    price_cents?: number | null;
    weekdays?: number[] | null;
    start?: string | null;
    end?: string | null;
  },
) =>
  writeForId(
    uid,
    "POST",
    "/v1/practices/onboard",
    body,
    `select public.practice_onboard($1, $2, $3, $4, $5, $6, $7, $8, $9::text[], $10, $11, $12, $13, $14::int[], $15, $16) as id`,
    [
      body.name,
      body.slug,
      body.city_id ?? null,
      body.address ?? null,
      body.practitioner_name,
      body.title ?? null,
      body.speciality_slug ?? null,
      body.bio ?? null,
      body.languages ?? null,
      body.service_name,
      body.duration_min,
      body.buffer_min,
      body.price_cents ?? null,
      body.weekdays ?? null,
      body.start ?? null,
      body.end ?? null,
    ],
  );

export const getSettings = (uid: string | null, practiceId: string) =>
  readOne<SettingsRow>(
    uid,
    `/v1/practices/${practiceId}/settings`,
    "select * from public.practice_settings_get($1)",
    [practiceId],
  );

export const updateSettings = (
  uid: string | null,
  practiceId: string,
  body: { name: string; timezone: string; min_notice_minutes: number; cancellation_notice_hours: number },
) =>
  write(
    uid,
    "PATCH",
    `/v1/practices/${practiceId}/settings`,
    body,
    "select public.practice_settings_update($1, $2, $3, $4, $5)",
    [practiceId, body.name, body.timezone, body.min_notice_minutes, body.cancellation_notice_hours],
  );

export const listLocations = (uid: string | null, practiceId: string) =>
  readList<LocationRow>(
    uid,
    `/v1/practices/${practiceId}/locations`,
    "select * from public.practice_locations_list($1)",
    [practiceId],
  );

export const upsertLocation = (
  uid: string | null,
  practiceId: string,
  body: {
    location_id?: string | null;
    name: string;
    address?: string | null;
    city_id?: string | null;
    is_primary?: boolean;
  },
) =>
  writeForId(
    uid,
    "PUT",
    `/v1/practices/${practiceId}/locations`,
    body,
    "select public.practice_location_upsert($1, $2, $3, $4, $5, $6) as id",
    [
      practiceId,
      body.location_id ?? null,
      body.name,
      body.address ?? null,
      body.city_id ?? null,
      body.is_primary ?? false,
    ],
  );

export const removeLocation = (uid: string | null, practiceId: string, locationId: string) =>
  write(
    uid,
    "DELETE",
    `/v1/practices/${practiceId}/locations/${locationId}`,
    undefined,
    "select public.practice_location_remove($1, $2)",
    [practiceId, locationId],
  );
