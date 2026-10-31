import { query } from "@/local/db";

export interface Ev {
  id: string; starts_at: Date; ends_at: Date; status: string; source: string; created_at: Date;
  practitioner_id: string; practitioner: string; service_id: string; service: string; price_cents: number | null;
  client_id: string; client: string; phone: string | null; email: string | null;
}

export const loadEvents = (uid: string, practiceId: string, from: Date, to: Date, includeCancelled = false) =>
  query<Ev>(
    uid,
    `select a.id, a.starts_at, a.ends_at, a.status::text, a.source, a.created_at, a.practitioner_id, p.display_name practitioner, a.service_id, s.name service, s.price_cents,
            c.id client_id, trim(c.first_name || ' ' || c.last_name) client, c.phone, c.email
       from public.appointments a join public.practitioners p on p.id = a.practitioner_id join public.services s on s.id = a.service_id join public.clients c on c.id = a.client_id
      where a.practice_id = $1 and a.starts_at >= $2 and a.starts_at < $3 and ($4 or a.status <> 'cancelled') order by a.starts_at`,
    [practiceId, from, to, includeCancelled],
  );

export interface Prac { id: string; display_name: string; title: string | null; speciality: string; bio: string | null; languages: string[]; verification_status: string; listing_status: string; user_id: string | null }
export const loadPractitioners = (uid: string, practiceId: string) =>
  query<Prac>(uid, "select id, display_name, title, speciality, bio, languages, verification_status, listing_status, user_id from public.practitioners where practice_id = $1 order by display_name", [practiceId]);

export interface Svc { id: string; name: string; description: string | null; duration_min: number; buffer_min: number; price_cents: number | null; active: boolean }
export const loadServices = (uid: string, practiceId: string) =>
  query<Svc>(uid, "select id, name, description, duration_min, buffer_min, price_cents, active from public.services where practice_id = $1 order by active desc, name", [practiceId]);

export interface ClientRow {
  id: string; first_name: string; last_name: string; email: string | null; phone: string | null; consent_record_storage: boolean; consent_at: Date | null;
  admin_notes: string | null; created_at: Date; user_id: string | null;
}

/** Visual + behavioural description of each appointment status. */
export const APPT_STATUS: Record<string, { label: string; tone: "info" | "good" | "warn" | "bad" | "neutral" }> = {
  booked: { label: "Booked", tone: "info" }, confirmed: { label: "Confirmed", tone: "info" }, checked_in: { label: "Checked in", tone: "good" },
  in_progress: { label: "In consultation", tone: "good" }, completed: { label: "Completed", tone: "neutral" }, cancelled: { label: "Cancelled", tone: "bad" }, no_show: { label: "No-show", tone: "warn" },
};
export const LIVE_STATUSES = ["booked", "confirmed", "checked_in", "in_progress"];

export { SOURCE_LABEL, isBabyBlue } from "./sources";

export interface BbBooking { id: string; created_at: Date; starts_at: Date; status: string; client: string; service: string; practitioner: string }

/** Bookings patients made through BabyBlue in the last `days` days, newest first. */
export const loadBabyBlueBookings = (uid: string, practiceId: string, days = 7, limit = 6) =>
  query<BbBooking>(
    uid,
    `select a.id, a.created_at, a.starts_at, a.status::text, trim(c.first_name || ' ' || c.last_name) client, s.name service, p.display_name practitioner
       from public.appointments a join public.clients c on c.id = a.client_id join public.services s on s.id = a.service_id join public.practitioners p on p.id = a.practitioner_id
      where a.practice_id = $1 and a.source = 'app' and a.status <> 'cancelled' and a.created_at >= now() - make_interval(days => $2)
      order by a.created_at desc limit $3`,
    [practiceId, days, limit],
  );
export const ROLE_LABEL: Record<string, string> = { practice_owner: "Owner", practitioner: "Practitioner", receptionist: "Reception", staff: "Staff" };
