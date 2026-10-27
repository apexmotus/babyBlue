import "server-only";
import { demoListedFacets } from "@/local/seed";
import { cityFromName, specialityByName, SPECIALITY_PAGES, type CityPage, type FinderData, type SpecialityPage } from "./directory";

/**
 * Which listing pages have practitioners on them.
 *
 * This is the seam to swap when BabyBlue runs on a live Supabase project: replace `demoListedFacets()` with a
 * server-side query over the public directory (listed practitioners at active practices, grouped by speciality
 * and city). Everything built on it, including route generation, the sitemap and the finder, follows.
 */
export interface Facet {
  speciality: SpecialityPage;
  city: CityPage;
  count: number;
}

export function getFacets(): Facet[] {
  const out: Facet[] = [];
  for (const f of demoListedFacets()) {
    const speciality = specialityByName(f.speciality);
    if (speciality) out.push({ speciality, city: cityFromName(f.city), count: f.count });
  }
  return out;
}

export function getCities(): CityPage[] {
  const seen = new Map<string, CityPage>();
  for (const f of getFacets()) seen.set(f.city.slug, f.city);
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Specialities that have at least one listed practitioner anywhere, in the taxonomy's display order. */
export function getListedSpecialities(): SpecialityPage[] {
  const have = new Set(getFacets().map((f) => f.speciality.slug));
  return SPECIALITY_PAGES.filter((s) => have.has(s.slug));
}

export const citiesFor = (spec: SpecialityPage): CityPage[] =>
  getFacets()
    .filter((f) => f.speciality.slug === spec.slug)
    .map((f) => f.city)
    .sort((a, b) => a.name.localeCompare(b.name));

export const specialitiesIn = (city: CityPage): SpecialityPage[] => {
  const have = new Set(getFacets().filter((f) => f.city.slug === city.slug).map((f) => f.speciality.slug));
  return SPECIALITY_PAGES.filter((s) => have.has(s.slug));
};

export const hasListings = (spec: SpecialityPage, city: CityPage): boolean =>
  getFacets().some((f) => f.speciality.slug === spec.slug && f.city.slug === city.slug);

export function getFinderData(): FinderData {
  return {
    specialities: getListedSpecialities().map((s) => ({ slug: s.slug, name: s.plural })),
    cities: getCities(),
    pairs: getFacets().map((f) => `${f.speciality.slug}/${f.city.slug}`),
  };
}
