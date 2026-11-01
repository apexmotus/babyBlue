import { call, hasRemoteApi } from "./http";
import type { ApiCallInit } from "./http";
import type { MyAppt } from "@/lib/appt";

/**
 * Request init for a patient call.
 *
 * Every `/v1/me/*` route is `[Authorize]`, so the caller's token is mandatory; without it the
 * API answers 401 `not_authenticated`. In remote mode the `userId` these functions receive
 * *is* the access token, matching the `userIdOrToken` convention in `./public.ts`.
 */
function authed(token: string | null, method: string, body?: unknown): ApiCallInit {
  return {
    method,
    token,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  };
}

export interface PatientProfile {
  user_id: string;
  display_name: string;
  phone: string | null;
  email: string;
  created_at: Date;
}

export type PatientAppointment = MyAppt & {
  appointment_id: string;
  practice_slug?: string;
  service_id: string;
  currency?: string;
  can_check_in: boolean;
};

export interface PatientHold {
  id: string;
  hold_id: string;
  starts_at: Date;
  ends_at: Date;
  expires_at: Date;
  practitioner_id: string;
  practitioner_name: string;
  display_name: string;
  speciality: string;
  service_name: string;
  duration_min: number;
  price_cents: number | null;
  currency: string;
  practice_name: string;
  cancellation_notice_hours: number;
  address: string | null;
  city: string | null;
}

function normalizeAppt(r: Record<string, unknown>): PatientAppointment {
  const id = String(r.appointment_id ?? r.id ?? "");
  return {
    id,
    appointment_id: id,
    status: String(r.status ?? "booked"),
    starts_at: r.starts_at instanceof Date ? r.starts_at : new Date(String(r.starts_at)),
    ends_at: r.ends_at instanceof Date ? r.ends_at : new Date(String(r.ends_at)),
    source: String(r.source ?? "app"),
    practice_id: String(r.practice_id ?? ""),
    practice_name: String(r.practice_name ?? ""),
    practice_slug: r.practice_slug ? String(r.practice_slug) : undefined,
    practitioner_id: String(r.practitioner_id ?? ""),
    practitioner_name: String(r.practitioner_name ?? ""),
    speciality: String(r.speciality ?? ""),
    service_name: String(r.service_name ?? ""),
    service_id: String(r.service_id ?? ""),
    price_cents: r.price_cents === null || r.price_cents === undefined ? null : Number(r.price_cents),
    currency: r.currency ? String(r.currency) : "ZAR",
    address: r.address === null || r.address === undefined ? null : String(r.address),
    city: r.city === null || r.city === undefined ? null : String(r.city),
    cancellation_notice_hours: Number(r.cancellation_notice_hours ?? 24),
    can_cancel: Boolean(r.can_cancel),
    can_check_in: Boolean(r.can_check_in),
  };
}

function normalizeHold(r: Record<string, unknown>): PatientHold {
  const id = String(r.hold_id ?? r.id ?? "");
  const name = String(r.practitioner_name ?? r.display_name ?? "");
  return {
    id,
    hold_id: id,
    starts_at: r.starts_at instanceof Date ? r.starts_at : new Date(String(r.starts_at)),
    ends_at: r.ends_at instanceof Date ? r.ends_at : new Date(String(r.ends_at)),
    expires_at: r.expires_at instanceof Date ? r.expires_at : new Date(String(r.expires_at)),
    practitioner_id: String(r.practitioner_id ?? ""),
    practitioner_name: name,
    display_name: name,
    speciality: String(r.speciality ?? ""),
    service_name: String(r.service_name ?? ""),
    duration_min: Number(r.duration_min ?? 30),
    price_cents: r.price_cents === null || r.price_cents === undefined ? null : Number(r.price_cents),
    currency: String(r.currency ?? "ZAR"),
    practice_name: String(r.practice_name ?? ""),
    cancellation_notice_hours: Number(r.cancellation_notice_hours ?? 24),
    address: r.address === null || r.address === undefined ? null : String(r.address),
    city: r.city === null || r.city === undefined ? null : String(r.city),
  };
}

export async function getMyProfile(userId: string | null): Promise<PatientProfile | null> {
  if (hasRemoteApi()) {
    const r = await call<Record<string, unknown>>("/v1/me/profile", authed(userId, "GET"));
    if (!r) return null;
    return {
      user_id: String(r.user_id ?? ""),
      display_name: String(r.display_name ?? ""),
      phone: r.phone === null || r.phone === undefined ? null : String(r.phone),
      email: String(r.email ?? ""),
      created_at: r.created_at instanceof Date ? r.created_at : new Date(String(r.created_at)),
    };
  }
  const { query } = await import("@/local/db");
  const rows = await query<Record<string, unknown>>(userId, "select * from public.patient_profile_get()");
  if (!rows[0]) return null;
  const r = rows[0];
  return {
    user_id: String(r.user_id ?? ""),
    display_name: String(r.display_name ?? ""),
    phone: r.phone === null || r.phone === undefined ? null : String(r.phone),
    email: String(r.email ?? ""),
    created_at: r.created_at instanceof Date ? r.created_at : new Date(String(r.created_at)),
  };
}

export async function updateMyProfile(
  userId: string | null,
  body: { display_name: string; phone: string | null },
): Promise<void> {
  if (hasRemoteApi()) {
    await call<void>("/v1/me/profile", authed(userId, "PATCH", body));
    return;
  }
  const { mutate } = await import("@/local/db");
  await mutate(userId, "select public.patient_profile_update($1, $2)", [body.display_name, body.phone]);
}

export async function listMyAppointments(
  userId: string | null,
  scope: "all" | "upcoming" | "past" = "all",
): Promise<PatientAppointment[]> {
  if (hasRemoteApi()) {
    const rows = await call<Record<string, unknown>[]>(
      `/v1/me/appointments?scope=${encodeURIComponent(scope)}`,
      authed(userId, "GET"),
    );
    return (rows ?? []).map(normalizeAppt);
  }
  const { query } = await import("@/local/db");
  const rows = await query<Record<string, unknown>>(
    userId,
    "select * from public.patient_appointments_list($1)",
    [scope],
  );
  return rows.map(normalizeAppt);
}

export async function getMyAppointment(
  userId: string | null,
  appointmentId: string,
): Promise<PatientAppointment | null> {
  if (hasRemoteApi()) {
    try {
      const r = await call<Record<string, unknown>>(
        `/v1/me/appointments/${encodeURIComponent(appointmentId)}`,
        authed(userId, "GET"),
      );
      return r ? normalizeAppt(r) : null;
    } catch {
      return null;
    }
  }
  const { query } = await import("@/local/db");
  const rows = await query<Record<string, unknown>>(
    userId,
    "select * from public.patient_appointment_get($1)",
    [appointmentId],
  );
  return rows[0] ? normalizeAppt(rows[0]) : null;
}

export async function holdSlot(
  userId: string | null,
  body: { practitioner_id: string; service_id: string; starts_at: string },
): Promise<{ id: string }> {
  if (hasRemoteApi()) {
    return call<{ id: string }>("/v1/me/holds", authed(userId, "POST", body));
  }
  const { mutate } = await import("@/local/db");
  const [{ id }] = await mutate<{ id: string }>(
    userId,
    "select public.patient_slot_hold($1, $2, $3::timestamptz) as id",
    [body.practitioner_id, body.service_id, body.starts_at],
  );
  return { id };
}

export async function getHold(
  userId: string | null,
  holdId: string,
): Promise<PatientHold | null> {
  if (hasRemoteApi()) {
    try {
      const r = await call<Record<string, unknown>>(
        `/v1/me/holds/${encodeURIComponent(holdId)}`,
        authed(userId, "GET"),
      );
      return r ? normalizeHold(r) : null;
    } catch {
      return null;
    }
  }
  const { query } = await import("@/local/db");
  const rows = await query<Record<string, unknown>>(
    userId,
    "select * from public.patient_hold_get($1)",
    [holdId],
  );
  return rows[0] ? normalizeHold(rows[0]) : null;
}

export async function releaseHold(userId: string | null, holdId: string): Promise<void> {
  if (hasRemoteApi()) {
    await call<void>(`/v1/me/holds/${encodeURIComponent(holdId)}`, authed(userId, "DELETE"));
    return;
  }
  const { mutate } = await import("@/local/db");
  await mutate(userId, "select public.patient_hold_release($1)", [holdId]);
}

export async function bookAppointment(
  userId: string | null,
  holdId: string,
): Promise<{ id: string }> {
  if (hasRemoteApi()) {
    return call<{ id: string }>("/v1/me/appointments", authed(userId, "POST", { hold_id: holdId }));
  }
  const { mutate } = await import("@/local/db");
  const [{ id }] = await mutate<{ id: string }>(
    userId,
    "select public.patient_appointment_book($1) as id",
    [holdId],
  );
  return { id };
}

export async function cancelMyAppointment(
  userId: string | null,
  appointmentId: string,
  reason?: string,
): Promise<void> {
  if (hasRemoteApi()) {
    await call<void>(
      `/v1/me/appointments/${encodeURIComponent(appointmentId)}/cancel`,
      authed(userId, "POST", { reason: reason ?? null }),
    );
    return;
  }
  const { mutate } = await import("@/local/db");
  await mutate(userId, "select public.patient_appointment_cancel($1, $2)", [
    appointmentId,
    reason ?? null,
  ]);
}

export async function rescheduleMyAppointment(
  userId: string | null,
  appointmentId: string,
  newStartsAt: string,
): Promise<void> {
  if (hasRemoteApi()) {
    await call<void>(
      `/v1/me/appointments/${encodeURIComponent(appointmentId)}/reschedule`,
      authed(userId, "POST", { new_starts_at: newStartsAt }),
    );
    return;
  }
  const { mutate } = await import("@/local/db");
  await mutate(userId, "select public.patient_appointment_reschedule($1, $2::timestamptz)", [
    appointmentId,
    newStartsAt,
  ]);
}

export async function checkInAppointment(
  userId: string | null,
  appointmentId: string,
): Promise<void> {
  if (hasRemoteApi()) {
    await call<void>(
      `/v1/me/appointments/${encodeURIComponent(appointmentId)}/check-in`,
      authed(userId, "POST"),
    );
    return;
  }
  const { mutate } = await import("@/local/db");
  await mutate(userId, "select public.patient_appointment_check_in($1)", [appointmentId]);
}

export async function exportMyAccount(userId: string | null): Promise<Record<string, unknown>> {
  if (hasRemoteApi()) {
    return call<Record<string, unknown>>("/v1/me/export", authed(userId, "GET"));
  }
  const { query } = await import("@/local/db");
  const rows = await query<{ export: Record<string, unknown> }>(
    userId,
    "select public.patient_account_export() as export",
  );
  return rows[0]?.export ?? {};
}

export async function deleteMyAccount(userId: string | null): Promise<void> {
  if (hasRemoteApi()) {
    await call<void>("/v1/me", authed(userId, "DELETE"));
    return;
  }
  const { mutate } = await import("@/local/db");
  await mutate(userId, "select public.patient_account_delete()");
}
