import { query } from "@/local/db";

export interface SearchRow {
  practitioner_id: string;
  practice_id: string;
  display_name: string;
  title: string | null;
  speciality: string;
  bio: string | null;
  languages: string[];
  verification_status: "unverified" | "pending" | "verified" | "rejected";
  practice_name: string;
  practice_slug: string;
  city: string | null;
  province: string | null;
  address: string | null;
  from_price_cents: number | null;
  service_count: number;
  next_available: Date | null;
}

export interface Slot { starts_at: Date; ends_at: Date }
export interface ServiceRow { id: string; name: string; description: string | null; duration_min: number; buffer_min: number; price_cents: number | null }
export interface ProfileRow extends SearchRow { cancellation_notice_hours: number; services: ServiceRow[] }

export const searchPractitioners = (userId: string | null, p: { q?: string; speciality?: string; city?: string; verifiedOnly?: boolean; limit?: number }) =>
  query<SearchRow>(userId, "select * from public.search_practitioners($1, $2, $3, $4, $5)", [p.q ?? null, p.speciality ?? null, p.city ?? null, !!p.verifiedOnly, p.limit ?? 60]);

export async function getProfile(userId: string | null, id: string): Promise<ProfileRow | null> {
  const rows = await query<SearchRow & { cancellation_notice_hours: number }>(
    userId,
    "select * from (select * from public.search_practitioners(null, null, null, false, 100)) r where r.practitioner_id = $1",
    [id],
  );
  if (!rows[0]) return null;
  const [pr] = await query<{ cancellation_notice_hours: number }>(userId, "select cancellation_notice_hours from public.practices where id = $1", [rows[0].practice_id]);
  const services = await query<ServiceRow>(
    userId,
    "select s.id, s.name, s.description, s.duration_min, s.buffer_min, s.price_cents from public.services s join public.practitioner_services ps on ps.service_id = s.id where ps.practitioner_id = $1 and s.active order by s.price_cents nulls last, s.name",
    [id],
  );
  return { ...rows[0], cancellation_notice_hours: pr?.cancellation_notice_hours ?? 24, services };
}

export const getSlots = (userId: string | null, practitioner: string, service: string, days = 14) =>
  query<Slot>(userId, "select starts_at, ends_at from public.get_available_slots($1, $2, current_date, current_date + $3::int)", [practitioner, service, days]);

export const SPECIALITIES = [
  { name: "General practice", icon: "stethoscope", blurb: "Everyday & family care" },
  { name: "Dentistry", icon: "smile", blurb: "Check-ups to treatment" },
  { name: "Physiotherapy", icon: "activity", blurb: "Movement & rehab" },
  { name: "Psychology", icon: "brain", blurb: "Mental health support" },
  { name: "Counselling", icon: "messages", blurb: "Talk it through" },
  { name: "Dietetics", icon: "leaf", blurb: "Food & health" },
  { name: "Optometry", icon: "eye", blurb: "Eye tests & lenses" },
  { name: "Chiropractic", icon: "bone", blurb: "Back, neck & posture" },
] as const;
