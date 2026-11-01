import {
  getPractitioner,
  listPractitionerServices,
  listSlots,
  searchPractitioners as apiSearchPractitioners,
} from "@/lib/api/public";
import { SPECIALITY_PAGES } from "./directory";

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

export interface Slot {
  starts_at: Date;
  ends_at: Date;
}

export interface ServiceRow {
  id: string;
  name: string;
  description: string | null;
  duration_min: number;
  buffer_min: number;
  price_cents: number | null;
}

export interface ProfileRow extends SearchRow {
  cancellation_notice_hours: number;
  services: ServiceRow[];
}

export async function searchPractitioners(
  userId: string | null,
  p: { q?: string; speciality?: string; city?: string; verifiedOnly?: boolean; limit?: number },
): Promise<SearchRow[]> {
  const rows = await apiSearchPractitioners(userId, {
    q: p.q,
    speciality: p.speciality,
    city: p.city,
    verifiedOnly: p.verifiedOnly,
    limit: p.limit ?? 40,
  });

  return rows.map((r) => ({
    ...r,
    next_available: r.next_available ? new Date(r.next_available) : null,
  }));
}

export async function getProfile(userId: string | null, id: string): Promise<ProfileRow | null> {
  const p = await getPractitioner(userId, id);
  if (!p) return null;
  const rawServices = await listPractitionerServices(userId, id);
  const services: ServiceRow[] = rawServices.map((s) => ({
    id: s.service_id,
    name: s.name,
    description: s.description,
    duration_min: s.duration_min,
    buffer_min: s.buffer_min,
    price_cents: s.price_cents,
  }));

  return {
    practitioner_id: p.practitioner_id,
    practice_id: p.practice_id,
    display_name: p.display_name,
    title: p.title,
    speciality: p.speciality,
    bio: p.bio,
    languages: p.languages,
    verification_status: p.verification_status,
    practice_name: p.practice_name,
    practice_slug: p.practice_slug,
    city: p.city,
    province: p.province,
    address: p.address,
    from_price_cents: services.reduce<number | null>(
      (min, s) => (s.price_cents != null && (min == null || s.price_cents < min) ? s.price_cents : min),
      null,
    ),
    service_count: services.length,
    next_available: null,
    cancellation_notice_hours: p.cancellation_notice_hours ?? 24,
    services,
  };
}

export async function getSlots(
  userId: string | null,
  practitioner: string,
  service: string,
  days = 14,
): Promise<Slot[]> {
  const from = new Date();
  const to = new Date(from.getTime() + days * 86_400_000);
  const fromStr = from.toISOString().slice(0, 10);
  const toStr = to.toISOString().slice(0, 10);
  const rows = await listSlots(userId, practitioner, service, fromStr, toStr);
  return rows.map((r) => ({
    starts_at: new Date(r.starts_at),
    ends_at: new Date(r.ends_at),
  }));
}

/** The specialities offered in discovery: one source of truth with the public listing pages (see directory.ts). */
export const SPECIALITIES = SPECIALITY_PAGES.map((s) => ({ name: s.name, icon: s.icon, blurb: s.blurb }));
