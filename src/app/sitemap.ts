import type { MetadataRoute } from "next";
import { listingPath } from "@/lib/directory";
import { getCities, getFacets, getListedSpecialities } from "@/lib/directory-facets";
import { SITE } from "@/lib/site";

const PATHS = ["/", "/directory", "/app", "/practitioners", "/os", "/growth", "/flow", "/solutions", "/pricing", "/about", "/contact", "/privacy", "/terms", "/popia"];

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
