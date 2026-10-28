// The practice directory, released in batches of 100. A batch is live once it is listed here. Each one goes through the
// data tests (tests/unit/practices-data.test.ts), then production, and is checked there before the next is added.
// Records come from OpenStreetMap (see source.json, scripts/directory/ and data/directory/README.md).
import type { DirectoryPractice } from "@/lib/practices/types";

export const BATCHES: DirectoryPractice[][] = [];
