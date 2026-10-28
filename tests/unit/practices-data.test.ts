import { describe, expect, it } from "vitest";
import { BATCHES } from "@/data/practices";
import source from "@/data/practices/source.json";
import { parsePhone } from "@/lib/phone";
import { KINDS, PROVINCES, osmUrl, type DirectoryPractice } from "@/lib/practices/types";

/**
 * The gate every batch passes before it goes to production. Nothing here trusts the data: a record that could mislead, expose
 * personal details or break a page fails the batch.
 */
const all: DirectoryPractice[] = BATCHES.flat();
const fold = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

describe("practice directory batches", () => {
  it("are batches of 100, and only the last may be smaller", () => {
    BATCHES.forEach((b, i) => {
      expect(b.length, `batch ${i + 1}`).toBeGreaterThan(0);
      expect(b.length, `batch ${i + 1}`).toBeLessThanOrEqual(100);
      if (i < BATCHES.length - 1) expect(b.length, `batch ${i + 1} is not the last`).toBe(100);
    });
  });

  it("never repeat a practice, across batches or under another OpenStreetMap id", () => {
    expect(new Set(all.map((p) => p.id)).size).toBe(all.length);
    const places = new Set<string>();
    for (const p of all) {
      const k = `${fold(p.name)}|${p.lat.toFixed(3)}|${p.lon.toFixed(3)}`;
      expect(places.has(k), `${p.name} (${p.id}) repeats another entry`).toBe(false);
      places.add(k);
    }
  });

  it("have a well-formed id that points at the practice's own OpenStreetMap page", () => {
    for (const p of all) {
      expect(p.id, p.name).toMatch(/^[nwr]\d{1,12}$/);
      expect(osmUrl(p.id)).toMatch(/^https:\/\/www\.openstreetmap\.org\/(node|way|relation)\/\d+$/);
    }
  });

  it("have safe, sensible names and places", () => {
    for (const p of all) {
      expect(p.name.length, p.id).toBeGreaterThanOrEqual(3);
      expect(p.name.length, p.id).toBeLessThanOrEqual(120);
      expect(p.name, p.id).not.toMatch(/[<>]/);
      expect(KINDS as readonly string[], p.id).toContain(p.kind);
      expect(PROVINCES as readonly string[], p.id).toContain(p.province);
      expect(p.city.trim().length, p.id).toBeGreaterThan(1);
      expect(p.city.length, p.id).toBeLessThanOrEqual(60);
      expect(Number.isInteger(p.quality) && p.quality >= 0 && p.quality <= 10, `${p.id} quality`).toBe(true);
    }
  });

  it("are inside South Africa", () => {
    for (const p of all) {
      expect(p.lat, p.id).toBeGreaterThan(-35.2);
      expect(p.lat, p.id).toBeLessThan(-21.9);
      expect(p.lon, p.id).toBeGreaterThan(16.3);
      expect(p.lon, p.id).toBeLessThan(33.1);
    }
  });

  it("give every practice something a person can use: a phone, a website or a street address", () => {
    for (const p of all) expect(Boolean(p.phone || p.website || p.street), `${p.name} (${p.id})`).toBe(true);
  });

  it("carry phone numbers only in international format", () => {
    for (const p of all.filter((x) => x.phone)) {
      expect(p.phone, p.id).toMatch(/^\+[1-9]\d{7,14}$/);
      expect(parsePhone(p.phone!).ok, `${p.id} ${p.phone}`).toBe(true);
    }
  });

  it("carry websites only as plain http(s) links", () => {
    for (const p of all.filter((x) => x.website)) {
      expect(p.website!.length, p.id).toBeLessThanOrEqual(200);
      expect(p.website, p.id).toMatch(/^https?:\/\/[^\s"'<>]+$/);
      expect(() => new URL(p.website!), p.id).not.toThrow();
    }
  });

  it("hold no email addresses and no fields beyond the agreed ones", () => {
    const allowed = new Set(["id", "name", "kind", "speciality", "street", "suburb", "city", "province", "postcode", "lat", "lon", "phone", "website", "quality"]);
    for (const p of all) {
      expect(Object.keys(p).filter((k) => !allowed.has(k)), `${p.id} has unexpected fields`).toEqual([]);
      expect(JSON.stringify({ ...p, website: undefined }), `${p.id} looks like it holds an email address`).not.toMatch(/[^\s"@]+@[^\s"@]+\.[a-z]{2,}/i);
    }
  });

  it("hold no directions, plus codes or foreign places in the address fields", () => {
    const notAnAddress = /[+,;:]|\b(kenya|zimbabwe|namibia|botswana|mozambique|lesotho|eswatini|swaziland|zambia|malawi|nigeria|ghana|uganda|tanzania)\b|\b(turn|left|right|junction|next to|opposite|near|behind|follow|entrance)\b/i;
    for (const p of all) for (const v of [p.street, p.suburb]) if (v) expect(v, `${p.name} (${p.id})`).not.toMatch(notAnAddress);
  });

  it("are never pharmacies, laboratories or collection points", () => {
    for (const p of all) expect(p.name, p.id).not.toMatch(/\b(pharmacy|pathology|laborator(y|ies)|blood (donor|donation)|collection point)\b/i);
  });
});

describe("practice directory source", () => {
  it("names OpenStreetMap contributors, the licence and the date it was retrieved", () => {
    expect(source.name).toBe("OpenStreetMap contributors");
    expect(source.licence).toMatch(/ODbL|Open Database/i);
    expect(source.licenceUrl).toMatch(/^https:\/\/opendatacommons\.org\//);
    expect(source.copyrightUrl).toBe("https://www.openstreetmap.org/copyright");
    expect(source.retrieved).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
