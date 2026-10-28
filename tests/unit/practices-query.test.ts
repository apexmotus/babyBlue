import { describe, expect, it } from "vitest";
import { directoryStats, queryPractices, sortPractices } from "@/lib/practices/query";
import { addressLine, hostOf, mapsUrl, osmUrl, type DirectoryPractice } from "@/lib/practices/types";

const mk = (i: number, over: Partial<DirectoryPractice> = {}): DirectoryPractice => ({
  id: `n${1000 + i}`,
  name: `Practice ${i}`,
  kind: "doctor",
  city: "Johannesburg",
  province: "Gauteng",
  lat: -26.2,
  lon: 28.0,
  phone: "+27115550100",
  quality: 5,
  ...over,
});

const sample: DirectoryPractice[] = [
  mk(1, { name: "Rosebank Family Practice", suburb: "Rosebank", quality: 9 }),
  mk(2, { name: "Sea Point Dental Studio", kind: "dentist", city: "Cape Town", province: "Western Cape", quality: 8 }),
  mk(3, { name: "Mediclinic Cape Gate", kind: "hospital", city: "Cape Town", province: "Western Cape", quality: 6 }),
  mk(4, { name: "Café Güçlü Physio", kind: "physiotherapist", city: "Durban", province: "KwaZulu-Natal", quality: 4 }),
  mk(5, { name: "Hatfield Clinic", kind: "clinic", city: "Pretoria", province: "Gauteng", speciality: "Paediatrics", quality: 5 }),
];

describe("directory search", () => {
  it("orders the most complete entries first, then by name", () => {
    expect(sortPractices(sample).map((p) => p.id)).toEqual(["n1001", "n1002", "n1003", "n1005", "n1004"]);
  });

  it("filters by type, province and city", () => {
    expect(queryPractices(sample, { kind: "dentist" }).items.map((p) => p.name)).toEqual(["Sea Point Dental Studio"]);
    expect(queryPractices(sample, { province: "gauteng" }).total).toBe(2);
    expect(queryPractices(sample, { city: "cape-town" }).total).toBe(2);
    expect(queryPractices(sample, { province: "western-cape", kind: "hospital" }).total).toBe(1);
  });

  it("ignores a type it does not know instead of returning nothing or crashing", () => {
    expect(queryPractices(sample, { kind: "wizard" }).total).toBe(sample.length);
  });

  it("searches names, suburbs, cities and specialities, ignoring case and accents, with every word needed", () => {
    expect(queryPractices(sample, { q: "rosebank" }).total).toBe(1);
    expect(queryPractices(sample, { q: "CAPE TOWN" }).total).toBe(2);
    expect(queryPractices(sample, { q: "guclu" }).total).toBe(1);
    expect(queryPractices(sample, { q: "paediatrics" }).total).toBe(1);
    expect(queryPractices(sample, { q: "dental durban" }).total).toBe(0);
  });

  it("pages results and keeps the page number in range", () => {
    const many = Array.from({ length: 53 }, (_, i) => mk(i));
    const p1 = queryPractices(many, { pageSize: 24 });
    expect(p1).toMatchObject({ total: 53, page: 1, pages: 3 });
    expect(p1.items).toHaveLength(24);
    expect(queryPractices(many, { page: 3, pageSize: 24 }).items).toHaveLength(5);
    expect(queryPractices(many, { page: 99, pageSize: 24 }).page).toBe(3);
    expect(queryPractices(many, { page: -4, pageSize: 24 }).page).toBe(1);
    expect(queryPractices(many, { page: Number.NaN, pageSize: 24 }).page).toBe(1);
    expect(queryPractices(many, { pageSize: 100000 }).items.length).toBe(53);
  });

  it("returns an empty, valid page when nothing matches", () => {
    expect(queryPractices([], {})).toEqual({ total: 0, page: 1, pages: 1, items: [] });
  });

  it("counts by type, province and city", () => {
    const s = directoryStats(sample);
    expect(s.total).toBe(5);
    expect(s.provinces[0]).toMatchObject({ name: "Gauteng", count: 2 });
    expect(s.cities.find((c) => c.slug === "cape-town")).toMatchObject({ name: "Cape Town", province: "Western Cape", count: 2 });
    expect(s.kinds.map((k) => k.kind)).toEqual(["hospital", "clinic", "doctor", "dentist", "physiotherapist"]);
  });
});

describe("directory helpers", () => {
  it("links to the practice's own OpenStreetMap page", () => {
    expect(osmUrl("n123")).toBe("https://www.openstreetmap.org/node/123");
    expect(osmUrl("w45")).toBe("https://www.openstreetmap.org/way/45");
    expect(osmUrl("r6")).toBe("https://www.openstreetmap.org/relation/6");
  });

  it("builds a readable address without repeating a part", () => {
    expect(addressLine({ street: "18 Cradock Avenue", suburb: "Rosebank", city: "Johannesburg", postcode: "2196" })).toBe("18 Cradock Avenue, Rosebank, Johannesburg, 2196");
    expect(addressLine({ city: "Durban" })).toBe("Durban");
    expect(addressLine({ suburb: "Durban", city: "Durban" })).toBe("Durban");
  });

  it("shows a link's host and a directions link", () => {
    expect(hostOf("https://www.clinic.co.za/about?x=1")).toBe("clinic.co.za");
    expect(mapsUrl({ lat: -26.2, lon: 28 })).toBe("https://www.google.com/maps/search/?api=1&query=-26.2,28");
  });
});
