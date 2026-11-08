import { slugify } from "@/lib/directory";
import { KINDS, type DirectoryPractice, type PracticeKind } from "./types";

export interface DirectoryQuery {
  /** Free text: matches the name, suburb, city and speciality. */
  q?: string;
  kind?: string;
  /** Province or city, as a slug (gauteng, cape-town). */
  province?: string;
  city?: string;
  page?: number;
  pageSize?: number;
}

export interface DirectoryPage {
  total: number;
  page: number;
  pages: number;
  items: DirectoryPractice[];
}

const fold = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");

export const isKind = (v: string | undefined): v is PracticeKind => !!v && (KINDS as readonly string[]).includes(v);

/** Orders by how complete the entry is, then by name, so the most useful entries come first. Call once on load. */
export const sortPractices = (all: DirectoryPractice[]) => [...all].sort((a, b) => b.quality - a.quality || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));

export function queryPractices(all: DirectoryPractice[], query: DirectoryQuery): DirectoryPage {
  const q = fold((query.q ?? "").trim());
  const words = q ? q.split(/\s+/) : [];
  const kind = isKind(query.kind) ? query.kind : undefined;
  const matches = all.filter((p) => {
    if (kind && p.kind !== kind) return false;
    if (query.province && slugify(p.province) !== query.province) return false;
    if (query.city && slugify(p.city) !== query.city) return false;
    if (words.length) {
      const hay = fold(`${p.name} ${p.suburb ?? ""} ${p.city} ${p.speciality ?? ""}`);
      if (!words.every((w) => hay.includes(w))) return false;
    }
    return true;
  });
  const size = Math.min(Math.max(query.pageSize ?? 24, 1), 100);
  const pages = Math.max(1, Math.ceil(matches.length / size));
  const page = Math.min(Math.max(Math.floor(query.page ?? 1) || 1, 1), pages);
  return { total: matches.length, page, pages, items: matches.slice((page - 1) * size, page * size) };
}

export interface DirectoryStats {
  total: number;
  provinces: { slug: string; name: string; count: number }[];
  cities: { slug: string; name: string; province: string; count: number }[];
  kinds: { kind: PracticeKind; count: number }[];
}

export function directoryStats(all: DirectoryPractice[]): DirectoryStats {
  const prov = new Map<string, { slug: string; name: string; count: number }>();
  const city = new Map<string, { slug: string; name: string; province: string; count: number }>();
  const kinds = new Map<PracticeKind, number>();
  for (const p of all) {
    const ps = slugify(p.province);
    prov.set(ps, { slug: ps, name: p.province, count: (prov.get(ps)?.count ?? 0) + 1 });
    const cs = slugify(p.city);
    city.set(cs, { slug: cs, name: p.city, province: p.province, count: (city.get(cs)?.count ?? 0) + 1 });
    kinds.set(p.kind, (kinds.get(p.kind) ?? 0) + 1);
  }
  return {
    total: all.length,
    provinces: [...prov.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    cities: [...city.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    kinds: KINDS.filter((k) => kinds.has(k)).map((k) => ({ kind: k, count: kinds.get(k)! })),
  };
}
