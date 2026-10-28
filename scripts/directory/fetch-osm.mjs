// Fetches named healthcare features in South Africa from OpenStreetMap (Overpass API), one province at a time, plus the
// cities and towns used to name the area of entries that have no address. Raw output only: nothing is cleaned or judged here.
//
//   node scripts/directory/fetch-osm.mjs <outDir>
//
// Data © OpenStreetMap contributors, made available under the ODbL (https://www.openstreetmap.org/copyright).
// One sequential pass that identifies itself, so it stays inside the Overpass fair-use policy. Do not run it in a loop.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const OUT = process.argv[2];
if (!OUT) {
  console.error("usage: node scripts/directory/fetch-osm.mjs <outDir>");
  process.exit(1);
}
mkdirSync(OUT, { recursive: true });

const ENDPOINT = "https://overpass-api.de/api/interpreter";
// Overpass filters some user-agents (a URL form got a 406); this plain form is accepted.
const UA = "BabyBlue-directory/1.0 (contact: owner)";
const PROVINCES = [
  ["ZA-EC", "Eastern Cape"],
  ["ZA-FS", "Free State"],
  ["ZA-GP", "Gauteng"],
  ["ZA-KZN", "KwaZulu-Natal"],
  ["ZA-LP", "Limpopo"],
  ["ZA-MP", "Mpumalanga"],
  ["ZA-NC", "Northern Cape"],
  ["ZA-NW", "North West"],
  ["ZA-WC", "Western Cape"],
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function overpass(query, label) {
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": UA },
        body: "data=" + encodeURIComponent(query),
      });
      if (res.ok) return await res.json();
      console.error(`${label}: HTTP ${res.status} (attempt ${attempt})`);
    } catch (e) {
      console.error(`${label}: ${e.message} (attempt ${attempt})`);
    }
    await sleep(30000 * attempt);
  }
  throw new Error(`${label}: gave up`);
}

const meta = { retrieved: new Date().toISOString().slice(0, 10), endpoint: ENDPOINT, provinces: {} };

for (const [iso, name] of PROVINCES) {
  const q = `[out:json][timeout:240];
area["ISO3166-2"="${iso}"]["boundary"="administrative"]->.a;
(
  nwr["healthcare"]["name"](area.a);
  nwr["amenity"~"^(clinic|doctors|hospital|dentist)$"]["name"](area.a);
  nwr["office"~"^(physician|therapist)$"]["name"](area.a);
);
out center tags;`;
  const json = await overpass(q, name);
  meta.osmBase = json.osm3s?.timestamp_osm_base ?? meta.osmBase;
  meta.provinces[iso] = { name, elements: json.elements.length };
  writeFileSync(path.join(OUT, `osm-${iso}.json`), JSON.stringify({ iso, name, elements: json.elements }));
  console.log(`${name}: ${json.elements.length} elements`);
  await sleep(12000);
}

const places = await overpass(
  `[out:json][timeout:240];
area["ISO3166-1"="ZA"]->.a;
node["place"~"^(city|town)$"]["name"](area.a);
out tags center;`,
  "places",
);
writeFileSync(path.join(OUT, "places.json"), JSON.stringify(places.elements));
meta.places = places.elements.length;
console.log(`places: ${places.elements.length}`);

writeFileSync(path.join(OUT, "meta.json"), JSON.stringify(meta, null, 2));
console.log("done", JSON.stringify(meta));
