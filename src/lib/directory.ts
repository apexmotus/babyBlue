/**
 * Public directory taxonomy: URL slugs, names and copy for the indexable listing pages
 * (/{speciality}, /{speciality}/{city}, /in/{city}). Pure data and helpers, safe on server and client.
 * Which pairs actually have listed practitioners comes from `directory-facets.ts` (server only).
 */

export type Tone = "deep" | "sky" | "sage" | "mist" | "sand";
export type SpecialityIconKey = "stethoscope" | "smile" | "activity" | "brain" | "messages" | "leaf" | "eye" | "bone";

export interface SpecialityPage {
  /** URL segment, e.g. "physiotherapy". Must not collide with a top-level route (tests/unit/directory.test.ts). */
  slug: string;
  /** Exactly the value stored in practitioners.speciality; it is what search filters on. */
  name: string;
  /** "Physiotherapists": headings and titles. */
  plural: string;
  /** "physiotherapist": inside sentences. */
  singular: string;
  /** One short line for tiles. */
  blurb: string;
  icon: SpecialityIconKey;
  tone: Tone;
}

export const SPECIALITY_PAGES: readonly SpecialityPage[] = [
  { slug: "general-practice", name: "General practice", plural: "General practitioners", singular: "general practitioner", blurb: "Everyday & family care", icon: "stethoscope", tone: "deep" },
  { slug: "dentistry", name: "Dentistry", plural: "Dentists", singular: "dentist", blurb: "Check-ups to treatment", icon: "smile", tone: "sky" },
  { slug: "physiotherapy", name: "Physiotherapy", plural: "Physiotherapists", singular: "physiotherapist", blurb: "Movement & rehab", icon: "activity", tone: "sage" },
  { slug: "psychology", name: "Psychology", plural: "Psychologists", singular: "psychologist", blurb: "Mental health support", icon: "brain", tone: "mist" },
  { slug: "counselling", name: "Counselling", plural: "Counsellors", singular: "counsellor", blurb: "Talk it through", icon: "messages", tone: "sand" },
  { slug: "dietetics", name: "Dietetics", plural: "Dietitians", singular: "dietitian", blurb: "Food & health", icon: "leaf", tone: "sage" },
  { slug: "optometry", name: "Optometry", plural: "Optometrists", singular: "optometrist", blurb: "Eye tests & lenses", icon: "eye", tone: "deep" },
  { slug: "chiropractic", name: "Chiropractic", plural: "Chiropractors", singular: "chiropractor", blurb: "Back, neck & posture", icon: "bone", tone: "sky" },
];

export interface CityPage {
  slug: string;
  /** Exactly the value stored in locations.city; it is what search filters on. */
  name: string;
}

/** What the finder needs to offer only choices that lead to a page with practitioners on it. */
export interface FinderData {
  specialities: { slug: string; name: string }[];
  cities: CityPage[];
  /** "speciality-slug/city-slug" for every pair with at least one listed practitioner. */
  pairs: string[];
}

export const slugify = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export const specialityBySlug = (slug: string) => SPECIALITY_PAGES.find((s) => s.slug === slug);
export const specialityByName = (name: string) => SPECIALITY_PAGES.find((s) => s.name === name);
export const cityFromName = (name: string): CityPage => ({ slug: slugify(name), name });

/* ───── page copy: honest, no claims the product cannot back ───── */

export function listingHeading(spec?: SpecialityPage, city?: CityPage): string {
  if (spec && city) return `${spec.plural} in ${city.name}`;
  if (spec) return `Find a ${spec.singular}`;
  if (city) return `Find care in ${city.name}`;
  return "Find care";
}

export function listingDescription(spec?: SpecialityPage, city?: CityPage): string {
  const where = city ? ` in ${city.name}` : "";
  const what = spec ? spec.plural.toLowerCase() : "practitioners";
  return `Browse ${what}${where}, see genuinely open appointment times and book in a few taps. Demo environment: every practitioner shown is fictional.`;
}

export const listingPath = (spec?: SpecialityPage, city?: CityPage): string => {
  if (spec && city) return `/${spec.slug}/${city.slug}`;
  if (spec) return `/${spec.slug}`;
  if (city) return `/in/${city.slug}`;
  return "/patient/search";
};
