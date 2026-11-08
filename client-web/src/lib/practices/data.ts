import "server-only";
import { BATCHES } from "@/data/practices";
import source from "@/data/practices/source.json";
import { directoryStats, sortPractices } from "./query";
import type { DirectoryPractice, DirectorySource } from "./types";

/** All released practices, most complete entries first. */
export const PRACTICES: DirectoryPractice[] = sortPractices(BATCHES.flat());
export const SOURCE: DirectorySource = source;

const BY_ID = new Map(PRACTICES.map((p) => [p.id, p]));
export const getPractice = (id: string) => BY_ID.get(id);
export const getBatchCount = () => BATCHES.length;

/** Small, public numbers: used by the home page, the directory and the release checks. */
export function getDirectorySummary() {
  const s = directoryStats(PRACTICES);
  return { batches: BATCHES.length, practices: s.total, provinces: s.provinces.length, cities: s.cities.length, retrieved: SOURCE.retrieved, source: SOURCE.name };
}
