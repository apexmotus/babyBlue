import { readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { cityFromName, listingDescription, listingHeading, listingPath, slugify, SPECIALITY_PAGES, specialityByName, specialityBySlug } from "@/lib/directory";
import { citiesFor, getCities, getFacets, getFinderData, getListedSpecialities, hasListings, specialitiesIn } from "@/lib/directory-facets";

const APP = path.resolve(__dirname, "../../src/app");
/** Every first-level URL segment already taken by a static route (route groups are transparent). */
function staticSegments(dir = APP, out = new Set<string>()) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    if (e.name.startsWith("(")) staticSegments(path.join(dir, e.name), out);
    else if (!e.name.startsWith("[")) out.add(e.name);
  }
  return out;
}

describe("directory taxonomy", () => {
  it("has unique, URL-safe slugs that match their own name", () => {
    const slugs = SPECIALITY_PAGES.map((s) => s.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const s of SPECIALITY_PAGES) {
      expect(s.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(slugify(s.name)).toBe(s.slug);
    }
  });

  it("never collides with an existing top-level route, or the /in prefix", () => {
    const taken = staticSegments();
    expect(taken.has("patient")).toBe(true); // sanity: the scan sees real routes
    for (const s of SPECIALITY_PAGES) expect(taken.has(s.slug), `${s.slug} is already a route`).toBe(false);
    expect(SPECIALITY_PAGES.some((s) => s.slug === "in")).toBe(false);
  });

  it("round-trips slug and database name", () => {
    for (const s of SPECIALITY_PAGES) {
      expect(specialityBySlug(s.slug)).toBe(s);
      expect(specialityByName(s.name)).toBe(s);
    }
    expect(specialityBySlug("dermatology")).toBeUndefined();
    expect(specialityBySlug("physiotherapy/cape-town")).toBeUndefined();
  });

  it("slugifies city names", () => {
    expect(cityFromName("Cape Town")).toEqual({ slug: "cape-town", name: "Cape Town" });
    expect(slugify("  Port  Elizabeth! ")).toBe("port-elizabeth");
    expect(slugify("Durbán")).toBe("durban");
  });

  it("builds honest headings, descriptions and paths", () => {
    const physio = specialityBySlug("physiotherapy")!;
    const cpt = cityFromName("Cape Town");
    expect(listingHeading(physio, cpt)).toBe("Physiotherapists in Cape Town");
    expect(listingHeading(physio)).toBe("Find a physiotherapist");
    expect(listingHeading(undefined, cpt)).toBe("Find care in Cape Town");
    expect(listingPath(physio, cpt)).toBe("/physiotherapy/cape-town");
    expect(listingPath(physio)).toBe("/physiotherapy");
    expect(listingPath(undefined, cpt)).toBe("/in/cape-town");
    // never claims the data is real while the product runs on fictional demo data
    expect(listingDescription(physio, cpt)).toMatch(/fictional/i);
  });
});

describe("directory facets (what has practitioners on it)", () => {
  it("lists only pairs that exist, in a stable order", () => {
    const facets = getFacets();
    expect(facets.length).toBeGreaterThan(0);
    expect(new Set(facets.map((f) => `${f.speciality.slug}/${f.city.slug}`)).size).toBe(facets.length);
    expect(facets.every((f) => f.count > 0)).toBe(true);
  });

  it("keeps unlisted specialities out (the pending practice is not public)", () => {
    expect(getListedSpecialities().some((s) => s.slug === "dermatology")).toBe(false);
    expect(getFacets().some((f) => f.speciality.name === "Dermatology")).toBe(false);
  });

  it("only offers cities and specialities that lead to a populated page", () => {
    const data = getFinderData();
    expect(data.pairs.length).toBe(getFacets().length);
    for (const s of getListedSpecialities()) {
      expect(citiesFor(s).length).toBeGreaterThan(0);
      for (const c of citiesFor(s)) expect(hasListings(s, c)).toBe(true);
    }
    for (const c of getCities()) {
      expect(specialitiesIn(c).length).toBeGreaterThan(0);
    }
    const physio = specialityBySlug("physiotherapy")!;
    expect(hasListings(physio, cityFromName("Durban"))).toBe(false);
  });
});
