// Writes one batch of 100 practices from the prepared list into src/data/practices and rebuilds the manifest.
//
//   node scripts/directory/emit-batch.mjs <prepared.json> <batchNumber> [meta.json]
//
// A batch is live once the manifest lists it. Run the data tests, then release it (scripts/directory/release-batch.sh).
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const [PREPARED, N, META] = process.argv.slice(2);
const SIZE = 100;
const n = Number(N);
if (!PREPARED || !Number.isInteger(n) || n < 1) {
  console.error("usage: node scripts/directory/emit-batch.mjs <prepared.json> <batchNumber> [meta.json]");
  process.exit(1);
}
const root = path.resolve(import.meta.dirname, "../..");
const dir = path.join(root, "src/data/practices");

const all = JSON.parse(readFileSync(PREPARED, "utf8"));
const slice = all.slice((n - 1) * SIZE, n * SIZE);
if (slice.length === 0) {
  console.error(`No records left for batch ${n} (the prepared list has ${all.length}).`);
  process.exit(2);
}
const name = `batch-${String(n).padStart(3, "0")}.json`;
if (existsSync(path.join(dir, name))) {
  console.error(`${name} already exists. Batches are never rewritten once released.`);
  process.exit(3);
}
writeFileSync(path.join(dir, name), "[\n" + slice.map((r) => JSON.stringify(r)).join(",\n") + "\n]\n");

if (META && existsSync(META)) {
  const meta = JSON.parse(readFileSync(META, "utf8"));
  const srcPath = path.join(dir, "source.json");
  const src = JSON.parse(readFileSync(srcPath, "utf8"));
  if (meta.retrieved && src.retrieved !== meta.retrieved) {
    src.retrieved = meta.retrieved;
    writeFileSync(srcPath, JSON.stringify(src, null, 2) + "\n");
  }
}

// Rebuild the manifest from the batch files that exist, so it can never drift from them.
const batches = readdirSync(dir).filter((f) => /^batch-\d{3}\.json$/.test(f)).sort();
const ident = (f) => "b" + f.slice(6, 9);
const manifest = `// The practice directory, released in batches of 100. A batch is live once it is listed here. Each one goes through the
// data tests (tests/unit/practices-data.test.ts), then production, and is checked there before the next is added.
// Records come from OpenStreetMap (see source.json, scripts/directory/ and data/directory/README.md).
import type { DirectoryPractice } from "@/lib/practices/types";
${batches.map((f) => `import ${ident(f)} from "./${f}";`).join("\n")}

export const BATCHES: DirectoryPractice[][] = [
${batches.map((f) => `  ${ident(f)} as unknown as DirectoryPractice[],`).join("\n")}
];
`;
writeFileSync(path.join(dir, "index.ts"), manifest);

console.log(JSON.stringify({ batch: n, file: name, records: slice.length, firstId: slice[0].id, liveTotal: (n - 1) * SIZE + slice.length, remaining: Math.max(0, all.length - n * SIZE) }));
