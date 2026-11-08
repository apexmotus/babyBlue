import {
  listCalendarAppointments,
  listPractitioners,
  listServices,
  getRecentAppBookings,
  type CalendarAppointmentRow,
  type PractitionerRow,
  type ServiceRow,
  type RecentAppBookingRow,
} from "@babyblue/api-client/practice";

/**
 * Shared reads for the Practice OS.
 *
 * These used to be hand-written joins over `appointments`, `practitioners`, `services` and
 * `clients` issued straight from the browser. Each is now one stored procedure, reached through
 * `./api/practice`, which is why `anon` and `authenticated` no longer need table grants.
 *
 * The exported shapes keep their original field names so the screens did not all have to change
 * at once; the mapping from the procedures' column names happens here, in one place.
 */

export interface Ev {
  id: string;
  starts_at: Date;
  ends_at: Date;
  status: string;
  source: string;
  created_at: Date;
  practitioner_id: string;
  practitioner: string;
  service_id: string;
  service: string;
  price_cents: number | null;
  client_id: string;
  client: string;
  phone: string | null;
  email: string | null;
}

const asDate = (v: Date | string | null | undefined): Date =>
  v instanceof Date ? v : new Date(String(v ?? 0));

function toEv(r: CalendarAppointmentRow): Ev {
  return {
    // `appointment_id` is typed nullable because ContractGen's nullability manifest is keyed by
    // column name globally; it is never null here.
    id: r.appointment_id ?? "",
    starts_at: asDate(r.starts_at),
    ends_at: asDate(r.ends_at),
    status: r.status ?? "booked",
    source: r.source ?? "os",
    created_at: asDate(r.created_at),
    practitioner_id: r.practitioner_id,
    practitioner: r.practitioner_name ?? "",
    service_id: r.service_id,
    service: r.service_name ?? "",
    price_cents: r.price_cents,
    client_id: r.client_id ?? "",
    client: r.client_name ?? "",
    phone: r.client_phone,
    email: r.client_email,
  };
}

export const loadEvents = (
  uid: string,
  practiceId: string,
  from: Date,
  to: Date,
  includeCancelled = false,
): Promise<Ev[]> =>
  listCalendarAppointments(uid, practiceId, from, to, includeCancelled).then((rows) => rows.map(toEv));

export interface Prac {
  id: string;
  display_name: string;
  title: string | null;
  speciality: string;
  speciality_slug: string | null;
  bio: string | null;
  languages: string[];
  verification_status: string;
  listing_status: string;
  user_id: string | null;
  service_count: number;
}

function toPrac(r: PractitionerRow): Prac {
  return {
    id: r.practitioner_id,
    display_name: r.display_name ?? "",
    title: r.title,
    speciality: r.speciality ?? "",
    speciality_slug: r.speciality_slug,
    bio: r.bio,
    languages: r.languages ?? [],
    verification_status: r.verification_status ?? "unverified",
    listing_status: r.listing_status ?? "unlisted",
    user_id: r.user_id,
    service_count: r.service_count,
  };
}

export const loadPractitioners = (uid: string, practiceId: string): Promise<Prac[]> =>
  listPractitioners(uid, practiceId).then((rows) => rows.map(toPrac));

export interface Svc {
  id: string;
  name: string;
  description: string | null;
  duration_min: number;
  buffer_min: number;
  price_cents: number | null;
  active: boolean;
  practitioner_count: number;
}

function toSvc(r: ServiceRow): Svc {
  return {
    id: r.service_id,
    name: r.name ?? "",
    description: r.description,
    duration_min: r.duration_min,
    buffer_min: r.buffer_min,
    price_cents: r.price_cents,
    active: r.active,
    practitioner_count: r.practitioner_count,
  };
}

export const loadServices = (uid: string, practiceId: string): Promise<Svc[]> =>
  listServices(uid, practiceId, true).then((rows) => rows.map(toSvc));

/** Visual + behavioural description of each appointment status. */
export const APPT_STATUS: Record<string, { label: string; tone: "info" | "good" | "warn" | "bad" | "neutral" }> = {
  booked: { label: "Booked", tone: "info" },
  confirmed: { label: "Confirmed", tone: "info" },
  checked_in: { label: "Checked in", tone: "good" },
  in_progress: { label: "In consultation", tone: "good" },
  completed: { label: "Completed", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "bad" },
  no_show: { label: "No-show", tone: "warn" },
};
export const LIVE_STATUSES = ["booked", "confirmed", "checked_in", "in_progress"];

export { SOURCE_LABEL, isBabyBlue } from "./sources";

export interface BbBooking {
  id: string;
  created_at: Date;
  starts_at: Date;
  status: string;
  client: string;
  service: string;
  practitioner: string;
}

/** Bookings patients made through BabyBlue in the last `days` days, newest first (D-22). */
export const loadBabyBlueBookings = (
  uid: string,
  practiceId: string,
  days = 7,
  limit = 6,
): Promise<BbBooking[]> =>
  getRecentAppBookings(uid, practiceId, days, limit).then((rows) =>
    rows.map((r: RecentAppBookingRow) => ({
      id: r.appointment_id ?? "",
      created_at: asDate(r.created_at),
      starts_at: asDate(r.starts_at),
      status: r.status ?? "booked",
      client: r.client_name ?? "",
      service: r.service_name ?? "",
      practitioner: r.practitioner_name ?? "",
    })),
  );

export const ROLE_LABEL: Record<string, string> = {
  practice_owner: "Owner",
  practitioner: "Practitioner",
  receptionist: "Reception",
  staff: "Staff",
};
