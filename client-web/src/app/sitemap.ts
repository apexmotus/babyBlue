import type { MetadataRoute } from "next";
import { listingPath } from "@/lib/directory";
import { getCities, getFacets, getListedSpecialities } from "@/lib/directory-facets";
import { SITE } from "@/lib/site";

// Patient site only. The practice side is deliberately not advertised to search engines (D-34).
const PATHS = ["/", "/directory", "/app", "/about", "/contact", "/privacy", "/terms", "/popia"];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  const pages = PATHS.map((p) => ({ url: `${SITE.url}${p}`, lastModified, changeFrequency: p === "/" ? ("weekly" as const) : ("monthly" as const), priority: p === "/" ? 1 : 0.7 }));
  // Public listing pages: only ones with practitioners on them (empty combinations are noindex and stay out).
  const listings = [
    ...getListedSpecialities().map((s) => listingPath(s)),
    ...getCities().map((c) => listingPath(undefined, c)),
    ...getFacets().map((f) => listingPath(f.speciality, f.city)),
  ].map((p) => ({ url: `${SITE.url}${p}`, lastModified, changeFrequency: "weekly" as const, priority: 0.6 }));
  return [...pages, ...listings];
}
