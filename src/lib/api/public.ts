import { call, hasRemoteApi } from "./http";

export interface PublicPractitionerSearchRow {
  practitioner_id: string;
  practice_id: string;
  display_name: string;
  title: string | null;
  speciality_slug: string | null;
  speciality: string;
  bio: string | null;
  languages: string[];
  verification_status: "unverified" | "pending" | "verified" | "rejected";
  practice_name: string;
  practice_slug: string;
  city: string | null;
  city_slug: string | null;
  province: string | null;
  address: string | null;
  from_price_cents: number | null;
  currency: string;
  service_count: number;
  next_available: Date | string | null;
}

export interface PublicPractitionerRow {
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
  currency: string;
  cancellation_notice_hours: number;
  min_notice_minutes: number;
}

export interface PublicPractitionerServiceRow {
  service_id: string;
  name: string;
  description: string | null;
  duration_min: number;
  buffer_min: number;
  price_cents: number | null;
  currency: string;
}

export interface PublicSlotRow {
  starts_at: Date | string;
  ends_at: Date | string;
}

export interface PublicCityRow {
  city_id: string;
  name: string;
  slug: string;
  province: string | null;
  practitioner_count: number;
}

export interface PublicSpecialityRow {
  slug: string;
  name: string;
  practitioner_count: number;
}

export interface PublicQueueInfoRow {
  practice_name: string;
  address: string | null;
  city: string | null;
  waiting_count: number;
  accepting: boolean;
}

export interface PublicQueueStatusRow {
  status: "waiting" | "in_consultation" | "done" | "cancelled";
  queue_position: number | null;
  practice_name: string;
}

export async function searchPractitioners(
  userIdOrToken: string | null,
  params: {
    q?: string;
    speciality?: string;
    city?: string;
    verifiedOnly?: boolean;
    limit?: number;
    offset?: number;
  } = {},
): Promise<PublicPractitionerSearchRow[]> {
  if (hasRemoteApi()) {
    const qs = new URLSearchParams();
    if (params.q) qs.set("q", params.q);
    if (params.speciality) qs.set("speciality", params.speciality);
    if (params.city) qs.set("city", params.city);
    if (params.verifiedOnly) qs.set("verified_only", "true");
    if (params.limit != null) qs.set("limit", String(params.limit));
    if (params.offset != null) qs.set("offset", String(params.offset));
    const queryStr = qs.toString();
    return call<PublicPractitionerSearchRow[]>(
      `/v1/directory/practitioners${queryStr ? `?${queryStr}` : ""}`,
      userIdOrToken ? { token: userIdOrToken } : { next: { revalidate: 60 } },
    );
  }

  const { query } = await import("@/local/db");
  return query<PublicPractitionerSearchRow>(
    userIdOrToken,
    `select * from public.public_practitioner_search($1, $2, $3, $4, $5, $6)`,
    [
      params.q ?? null,
      params.speciality ?? null,
      params.city ?? null,
      !!params.verifiedOnly,
      params.limit ?? 40,
      params.offset ?? 0,
    ],
  );
}

export async function getPractitioner(
  userIdOrToken: string | null,
  practitionerId: string,
): Promise<PublicPractitionerRow | null> {
  if (hasRemoteApi()) {
    try {
      return await call<PublicPractitionerRow>(
        `/v1/directory/practitioners/${practitionerId}`,
        userIdOrToken ? { token: userIdOrToken } : { next: { revalidate: 300 } },
      );
    } catch {
      return null;
    }
  }

  const { query } = await import("@/local/db");
  const rows = await query<PublicPractitionerRow>(
    userIdOrToken,
    `select * from public.public_practitioner_get($1)`,
    [practitionerId],
  );
  return rows[0] ?? null;
}

export async function listPractitionerServices(
  userIdOrToken: string | null,
  practitionerId: string,
): Promise<PublicPractitionerServiceRow[]> {
  if (hasRemoteApi()) {
    return call<PublicPractitionerServiceRow[]>(
      `/v1/directory/practitioners/${practitionerId}/services`,
      userIdOrToken ? { token: userIdOrToken } : { next: { revalidate: 300 } },
    );
  }

  const { query } = await import("@/local/db");
  return query<PublicPractitionerServiceRow>(
    userIdOrToken,
    `select * from public.public_practitioner_services($1)`,
    [practitionerId],
  );
}

export async function listSlots(
  userIdOrToken: string | null,
  practitionerId: string,
  serviceId: string,
  fromDate: string,
  toDate: string,
): Promise<PublicSlotRow[]> {
  if (hasRemoteApi()) {
    const qs = new URLSearchParams({
      service: serviceId,
      from: fromDate,
      to: toDate,
    });
    return call<PublicSlotRow[]>(
      `/v1/directory/practitioners/${practitionerId}/slots?${qs.toString()}`,
      { token: userIdOrToken, cache: "no-store" },
    );
  }

  const { query } = await import("@/local/db");
  return query<PublicSlotRow>(
    userIdOrToken,
    `select * from public.public_slots_list($1, $2, $3::date, $4::date)`,
    [practitionerId, serviceId, fromDate, toDate],
  );
}

export async function listCities(userIdOrToken: string | null = null): Promise<PublicCityRow[]> {
  if (hasRemoteApi()) {
    return call<PublicCityRow[]>(
      "/v1/directory/cities",
      userIdOrToken ? { token: userIdOrToken } : { next: { revalidate: 3600 } },
    );
  }

  const { query } = await import("@/local/db");
  return query<PublicCityRow>(userIdOrToken, `select * from public.public_city_list()`);
}

export async function listSpecialities(userIdOrToken: string | null = null): Promise<PublicSpecialityRow[]> {
  if (hasRemoteApi()) {
    return call<PublicSpecialityRow[]>(
      "/v1/directory/specialities",
      userIdOrToken ? { token: userIdOrToken } : { next: { revalidate: 3600 } },
    );
  }

  const { query } = await import("@/local/db");
  return query<PublicSpecialityRow>(userIdOrToken, `select * from public.public_speciality_list()`);
}

export async function getQueueInfo(slug: string): Promise<PublicQueueInfoRow | null> {
  if (hasRemoteApi()) {
    try {
      return await call<PublicQueueInfoRow>(`/v1/queue/${encodeURIComponent(slug)}`, { cache: "no-store" });
    } catch {
      return null;
    }
  }

  const { query } = await import("@/local/db");
  const rows = await query<PublicQueueInfoRow>(
    null,
    `select * from public.public_queue_info($1)`,
    [slug],
  );
  return rows[0] ?? null;
}

export async function joinQueue(
  slug: string,
  fullName: string,
  phone: string | null,
  urgency: "routine" | "urgent" = "routine",
): Promise<string> {
  if (hasRemoteApi()) {
    const res = await call<{ token: string }>(`/v1/queue/${encodeURIComponent(slug)}/join`, {
      method: "POST",
      body: JSON.stringify({ full_name: fullName, phone, urgency }),
    });
    return res.token;
  }

  const { mutate } = await import("@/local/db");
  const rows = await mutate<{ token: string }>(
    null,
    `select public.public_queue_join($1, $2, $3, $4) as token`,
    [slug, fullName, phone, urgency],
  );
  return rows[0].token;
}

export async function getQueueStatus(token: string): Promise<PublicQueueStatusRow | null> {
  if (hasRemoteApi()) {
    try {
      return await call<PublicQueueStatusRow>(`/v1/queue/tokens/${encodeURIComponent(token)}`, { cache: "no-store" });
    } catch {
      return null;
    }
  }

  const { query } = await import("@/local/db");
  const rows = await query<PublicQueueStatusRow>(
    null,
    `select * from public.public_queue_status($1)`,
    [token],
  );
  return rows[0] ?? null;
}

export async function leaveQueue(token: string): Promise<void> {
  if (hasRemoteApi()) {
    await call<void>(`/v1/queue/tokens/${encodeURIComponent(token)}`, {
      method: "DELETE",
    });
    return;
  }

  const { mutate } = await import("@/local/db");
  await mutate(null, `select public.public_queue_leave($1)`, [token]);
}
