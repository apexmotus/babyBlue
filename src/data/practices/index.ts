// The practice directory, released in batches of 100. A batch is live once it is listed here. Each one goes through the
// data tests (tests/unit/practices-data.test.ts), then production, and is checked there before the next is added.
// Records come from OpenStreetMap (see source.json, scripts/directory/ and data/directory/README.md).
import type { DirectoryPractice } from "@/lib/practices/types";
import b001 from "./batch-001.json";
import b002 from "./batch-002.json";
import b003 from "./batch-003.json";
import b004 from "./batch-004.json";
import b005 from "./batch-005.json";

export const BATCHES: DirectoryPractice[][] = [
  b001 as unknown as DirectoryPractice[],
  b002 as unknown as DirectoryPractice[],
  b003 as unknown as DirectoryPractice[],
  b004 as unknown as DirectoryPractice[],
  b005 as unknown as DirectoryPractice[],
];
