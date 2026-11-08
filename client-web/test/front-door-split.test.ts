import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { NAV, PRO_NAV } from "@/lib/site";

// D-34: the patient site is a rider app. Like a ride-hailing app it shows nothing of the supply side:
// no link to, mention of, or recruiting language for the practice side. The patient site is everything
// below, inside client-web; the practice side is client-web's own (pro) marketing pages plus the
// separate admin-dashboard app, and is reached by direct address only.
const root = path.resolve(__dirname, "..");
const PATIENT_SIDE = [
  "src/app/(site)",
  "src/app/patient",
  "src/components/front",
  "src/components/directory",
  "src/components/patient",
  "src/lib/directory.ts",
  "src/lib/practices",
  "src/lib/directory-facets.ts",
  "src/lib/meta.ts",
];

const PRACTICE_PATHS = ["practitioners", "os", "growth", "flow", "solutions", "pricing", "practice"];
// A quoted route such as "/os", "/growth/x" or "/practice/login". Imports like "@/lib/practices/x" never start with "/".
const PRACTICE_LINK = new RegExp(`["'\`](/(?:${PRACTICE_PATHS.join("|")}))(?:["'\`/?#])`, "g");
// Product names and supply-side (recruiting) language.
const PRACTICE_NAMES =
  /BabyBlue (OS|Growth|Flow)\b|Practice login|join(ed|s)? BabyBlue|run (a|one of these) practices?|opened a diary|take bookings|practice tools|tools for practi|for practitioners|own (this|a) practice|claim (this|a|your) (listing|practice)/gi;

function* sources(target: string): Generator<string> {
  if (statSync(target).isFile()) return yield target;
  for (const name of readdirSync(target)) {
    const full = path.join(target, name);
    if (statSync(full).isDirectory()) yield* sources(full);
    else if (/\.tsx?$/.test(name)) yield full;
  }
}

describe("patient site does not reveal the practice side (D-34)", () => {
  const files = PATIENT_SIDE.flatMap((d) => [...sources(path.join(root, d))]);

  it("scans a real set of files", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it("links to no practice-side route", () => {
    const hits = files.flatMap((f) => [...readFileSync(f, "utf8").matchAll(PRACTICE_LINK)].map((m) => `${path.relative(root, f)}: ${m[1]}`));
    expect(hits).toEqual([]);
  });

  it("names no practice-side product and uses no supply-side language", () => {
    const hits = files.flatMap((f) => [...readFileSync(f, "utf8").matchAll(PRACTICE_NAMES)].map((m) => `${path.relative(root, f)}: ${m[0]}`));
    expect(hits).toEqual([]);
  });

  it("keeps the patient navigation clear of practice pages", () => {
    for (const n of NAV) expect(n.href).not.toMatch(new RegExp(`^/(${PRACTICE_PATHS.join("|")})(/|$)`));
  });

  it("does not advertise the practice side to search engines", () => {
    const sitemap = readFileSync(path.join(root, "src/app/sitemap.ts"), "utf8");
    const robots = readFileSync(path.join(root, "src/app/robots.ts"), "utf8");
    const pro = readFileSync(path.join(root, "src/app/(pro)/layout.tsx"), "utf8");
    for (const p of PRACTICE_PATHS.filter((x) => x !== "practice")) {
      expect(sitemap).not.toContain(`"/${p}"`);
      expect(robots).toContain(`"/${p}"`);
    }
    expect(pro).toMatch(/index:\s*false/);
  });

  it("keeps the practice navigation on the practice side", () => {
    expect(PRO_NAV.map((n) => n.href)).toEqual(["/os", "/growth", "/flow", "/solutions", "/pricing"]);
  });
});
