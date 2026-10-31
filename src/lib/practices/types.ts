/**
 * The practice directory: real practices from OpenStreetMap, shown so people can find and call them. They are NOT on
 * BabyBlue (no diaries, no bookings, no reviews, no ratings, nothing verified). Every record keeps its OpenStreetMap id so it
 * can be traced and corrected at the source. Pure types and helpers: safe on server and client.
 */

export const KINDS = ["hospital", "clinic", "doctor", "dentist", "physiotherapist", "psychologist", "dietitian", "optometrist", "chiropractor", "other"] as const;
export type PracticeKind = (typeof KINDS)[number];

export const KIND_INFO: Record<PracticeKind, { label: string; plural: string }> = {
  hospital: { label: "Hospital", plural: "Hospitals" },
  clinic: { label: "Clinic", plural: "Clinics" },
  doctor: { label: "Doctor", plural: "Doctors" },
  dentist: { label: "Dentist", plural: "Dentists" },
  physiotherapist: { label: "Physiotherapist", plural: "Physiotherapists" },
  psychologist: { label: "Psychologist or counsellor", plural: "Psychologists & counsellors" },
  dietitian: { label: "Dietitian", plural: "Dietitians" },
  optometrist: { label: "Optometrist", plural: "Optometrists" },
  chiropractor: { label: "Chiropractor", plural: "Chiropractors" },
  other: { label: "Other health professional", plural: "Other health professionals" },
};

export const PROVINCES = ["Eastern Cape", "Free State", "Gauteng", "KwaZulu-Natal", "Limpopo", "Mpumalanga", "Northern Cape", "North West", "Western Cape"] as const;

export interface DirectoryPractice {
  /** OpenStreetMap element: n123 = node 123, w123 = way 123, r123 = relation 123. */
  id: string;
  name: string;
  kind: PracticeKind;
  /** Medical speciality as OpenStreetMap contributors tagged it, tidied for display (e.g. "Paediatrics"). */
  speciality?: string;
  street?: string;
  suburb?: string;
  city: string;
  province: string;
  postcode?: string;
  lat: number;
  lon: number;
  /** International format, as published on the practice's OpenStreetMap entry. Never an email address. */
  phone?: string;
  /** http(s) only. */
  website?: string;
  /** How complete the entry is (0 to 10); used for ordering, never shown as a rating. */
  quality: number;
}

export interface DirectorySource {
  name: string;
  licence: string;
  licenceUrl: string;
  copyrightUrl: string;
  /** Date the data was fetched, e.g. 2026-10-28. */
  retrieved: string;
}

/** Listing-page speciality (see directory.ts) to the directory kind that fills it. */
export const KIND_FOR_SPECIALITY: Record<string, PracticeKind> = {
  "general-practice": "doctor",
  dentistry: "dentist",
  physiotherapy: "physiotherapist",
  psychology: "psychologist",
  counselling: "psychologist",
  dietetics: "dietitian",
  optometry: "optometrist",
  chiropractic: "chiropractor",
};

const OSM_TYPE: Record<string, string> = { n: "node", w: "way", r: "relation" };
/** The practice's own OpenStreetMap page: where anyone can correct it. */
export const osmUrl = (id: string) => `https://www.openstreetmap.org/${OSM_TYPE[id[0]] ?? "node"}/${id.slice(1)}`;
export const mapsUrl = (p: Pick<DirectoryPractice, "lat" | "lon">) => `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lon}`;

export const addressLine = (p: Pick<DirectoryPractice, "street" | "suburb" | "city" | "postcode">) =>
  [p.street, p.suburb, p.city, p.postcode].filter((x, i, a) => x && a.indexOf(x) === i).join(", ");

/** Readable host for a link label: https://www.clinic.co.za/about -> clinic.co.za */
export const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};
