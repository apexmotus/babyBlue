import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { NAV, PRO_NAV } from "@/lib/site";

// D-34: patients must not meet the practice side. The patient site is everything below; the practice
// side lives in src/app/(pro) and src/app/practice and is reached by direct address only.
const root = path.resolve(__dirname, "../..");
const PATIENT_SIDE = ["src/app/(site)", "src/app/patient", "src/components/front", "src/components/directory", "src/components/patient"];

const PRACTICE_PATHS = ["practitioners", "os", "growth", "flow", "solutions", "pricing", "practice"];
// A quoted route such as "/os", "/growth/x" or "/practice/login". Imports like "@/lib/practices/x" never start with "/".
const PRACTICE_LINK = new RegExp(`["'\`](/(?:${PRACTICE_PATHS.join("|")}))(?:["'\`/?#])`, "g");
const PRACTICE_NAMES = /BabyBlue (OS|Growth|Flow)\b|Practice login/g;

function* sources(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) yield* sources(full);
    else if (/\.(tsx?|css)$/.test(name) && !/\.css$/.test(name)) yield full;
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

  it("names no practice-side product", () => {
    const hits = files.flatMap((f) => [...readFileSync(f, "utf8").matchAll(PRACTICE_NAMES)].map((m) => `${path.relative(root, f)}: ${m[0]}`));
    expect(hits).toEqual([]);
  });

  it("keeps the patient navigation clear of practice pages", () => {
    for (const n of NAV) expect(n.href).not.toMatch(new RegExp(`^/(${PRACTICE_PATHS.join("|")})(/|$)`));
  });

  it("keeps the practice navigation on the practice side", () => {
    expect(PRO_NAV.map((n) => n.href)).toEqual(["/os", "/growth", "/flow", "/solutions", "/pricing"]);
  });
});
