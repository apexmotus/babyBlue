// Turns the raw OpenStreetMap files (see fetch-osm.mjs) into the clean, ordered list of practices that is released in batches.
//
//   node scripts/directory/build-dataset.mjs <rawDir> <outDir>
//
// Writes <outDir>/prepared.json (every kept practice, best entries first) and <outDir>/report.json (what was kept and why not).
//
// What is deliberately NOT kept: emails (never read), personal or WhatsApp mobile tags, pharmacies, laboratories, blood and
// sample collection points, anything without a name, and entries with no phone, website or street address (nothing a person
// could use). Phone numbers and websites are only the ones the practice's own entry publishes under its business tags.
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { parsePhone } from "../../src/lib/phone.ts";

const [RAW, OUT] = process.argv.slice(2);
if (!RAW || !OUT) {
  console.error("usage: node scripts/directory/build-dataset.mjs <rawDir> <outDir>");
  process.exit(1);
}
mkdirSync(OUT, { recursive: true });

const report = { rawElements: 0, dropped: {}, kept: 0 };
const drop = (why) => (report.dropped[why] = (report.dropped[why] ?? 0) + 1);

/* ───── places used to name the area of entries that have no address city ───── */
const places = JSON.parse(readFileSync(path.join(RAW, "places.json"), "utf8"))
  .filter((p) => p.tags?.name && typeof p.lat === "number")
  .map((p) => ({ name: tidyCity(p.tags.name), lat: p.lat, lon: p.lon }));

const placeNames = new Set(places.map((p) => p.name.toLowerCase()));
const toRad = (d) => (d * Math.PI) / 180;
function km(aLat, aLon, bLat, bLon) {
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}
function nearestPlace(lat, lon, maxKm = 35) {
  let best = null;
  let bestD = Infinity;
  for (const p of places) {
    if (Math.abs(p.lat - lat) > 0.5 || Math.abs(p.lon - lon) > 0.6) continue; // cheap box before the real distance
    const d = km(lat, lon, p.lat, p.lon);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return bestD <= maxKm ? best : null;
}

/* ───── tidy helpers ───── */
function titleCase(s) {
  return s.toLowerCase().replace(/(^|[\s-])([a-zà-ÿ])/g, (_, a, b) => a + b.toUpperCase()).replace(/\b(Of|And|The|Van|Der|De)\b/g, (w) => w.toLowerCase()).replace(/^./, (c) => c.toUpperCase());
}
function tidyCity(raw) {
  let s = String(raw).replace(/\s+/g, " ").trim();
  s = s.replace(/^City of /i, "").replace(/ Metropolitan Municipality$/i, "").replace(/ Local Municipality$/i, "").replace(/ Municipality$/i, "").trim();
  if (s === s.toUpperCase() || s === s.toLowerCase()) s = titleCase(s);
  return s;
}
const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const fold = (s) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
// Mappers sometimes type directions, a Google plus code or another country into an address field. Such text never reaches a card.
const NOT_AN_ADDRESS = /[+,;:]|\b(kenya|zimbabwe|namibia|botswana|mozambique|lesotho|eswatini|swaziland|zambia|malawi|nigeria|ghana|uganda|tanzania)\b|\b(turn|left|right|junction|next to|opposite|near|behind|follow|entrance)\b/i;
const saneStreet = (v) => (v && v.length >= 3 && v.length <= 60 && !NOT_AN_ADDRESS.test(v) ? v : undefined);
const saneSuburb = (v) => {
  const first = clean(String(v ?? "").split(",")[0]);
  return first.length >= 2 && first.length <= 40 && !/^d+$/.test(first) && !NOT_AN_ADDRESS.test(first) ? first : undefined;
};
// Some entries are tagged as a clinic or hospital but are named as a pharmacy or laboratory. They are not practices.
const NOT_A_PRACTICE_NAME = /\b(pharmacy|pharmacies|pathology|laborator(y|ies)|blood (donor|donation|bank)|collection point|testing site|vaccination site)\b/i;
const GENERIC = new Set(["clinic", "hospital", "doctor", "doctors", "dentist", "dentists", "medical centre", "medical center", "surgery", "health centre", "health center", "rooms", "practice", "physiotherapy", "physio"]);

/* ───── what kind of practice is this? (null = not a practice) ───── */
const OTHER_HEALTHCARE = new Set(["audiologist", "podiatrist", "occupational_therapist", "speech_therapist", "midwife", "alternative", "rehabilitation", "counselling", "osteopath", "biokinetics"]);
function classify(t) {
  const am = t.amenity;
  const hc = t.healthcare;
  const rawSpec = clean((t["healthcare:speciality"] ?? "").split(";")[0]).replace(/_/g, " ");
  if (am === "pharmacy" || hc === "pharmacy") return null;
  if (["laboratory", "blood_donation", "sample_collection", "vaccination_centre", "hospice", "yes"].includes(hc)) return null;
  const speciality = rawSpec && rawSpec.toLowerCase() !== "general" ? rawSpec.charAt(0).toUpperCase() + rawSpec.slice(1) : undefined;
  if (am === "hospital" || hc === "hospital") return { kind: "hospital", speciality };
  if (am === "dentist" || hc === "dentist") return { kind: "dentist", speciality };
  if (hc === "physiotherapist") return { kind: "physiotherapist", speciality };
  if (hc === "psychotherapist" || hc === "psychologist" || hc === "counselling") return { kind: "psychologist", speciality };
  if (hc === "dietitian" || hc === "nutritionist" || hc === "nutrition_counselling") return { kind: "dietitian", speciality };
  if (hc === "optometrist") return { kind: "optometrist", speciality };
  if (hc === "chiropractor" || /chiropract/i.test(rawSpec)) return { kind: "chiropractor", speciality: undefined };
  if (OTHER_HEALTHCARE.has(hc)) return { kind: "other", speciality: speciality ?? titleCase(hc.replace(/_/g, " ")) };
  if (am === "clinic" || hc === "clinic" || hc === "centre") return { kind: "clinic", speciality };
  if (am === "doctors" || hc === "doctor" || t.office === "physician") return { kind: "doctor", speciality };
  if (t.office === "therapist") return { kind: "other", speciality: speciality ?? "Therapy" };
  return null;
}

/* ───── contact details: business tags only ───── */
function firstPhone(t) {
  for (const key of ["phone", "contact:phone"]) {
    for (const part of String(t[key] ?? "").split(/[;,/]/)) {
      const r = parsePhone(part);
      if (r.ok) return r.e164;
    }
  }
  return undefined;
}
function website(t) {
  const raw = clean(t.website ?? t["contact:website"] ?? t.url);
  if (!raw || raw.length > 200) return undefined;
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (!/^https?:$/.test(u.protocol) || !u.hostname.includes(".") || /\s/.test(u.href)) return undefined;
    return u.href.replace(/\/$/, "");
  } catch {
    return undefined;
  }
}

/* ───── read, clean, order ───── */
const files = readdirSync(RAW).filter((f) => /^osm-ZA-.+\.json$/.test(f)).sort();
const seen = new Set();
const records = [];
for (const f of files) {
  const { name: province, elements } = JSON.parse(readFileSync(path.join(RAW, f), "utf8"));
  for (const el of elements) {
    report.rawElements++;
    const id = `${el.type[0]}${el.id}`;
    if (seen.has(id)) {
      drop("repeated across provinces");
      continue;
    }
    seen.add(id);
    const t = el.tags ?? {};
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (typeof lat !== "number" || typeof lon !== "number" || lat > -21.9 || lat < -35.2 || lon < 16.3 || lon > 33.1) {
      drop("no usable location");
      continue;
    }
    const cls = classify(t);
    if (!cls) {
      drop("not a practice (pharmacy, lab, collection point and similar)");
      continue;
    }
    const name = clean(t.name);
    if (name.length < 3 || name.length > 120 || /[<>]/.test(name) || GENERIC.has(fold(name))) {
      drop("name missing, too generic or unsafe");
      continue;
    }
    if (NOT_A_PRACTICE_NAME.test(name)) {
      drop("not a practice (pharmacy, lab, collection point and similar)");
      continue;
    }
    const house = clean(t["addr:housenumber"]);
    const road = clean(t["addr:street"]);
    const street = saneStreet(road ? (house ? `${house} ${road}` : road) : undefined);
    const suburbTag = clean(t["addr:suburb"] || t["addr:neighbourhood"]) || undefined;
    const postcode = /^\d{4}$/.test(clean(t["addr:postcode"])) ? clean(t["addr:postcode"]) : undefined;
    // City: the entry's own address city when OpenStreetMap knows it as a city or town. Mappers often type a suburb there
    // ("Claremont"), which would fragment the filters, so then the nearest city or town names the area and the suburb stays a suburb.
    const addrCity = clean(t["addr:city"] || t["addr:town"] || t["addr:village"]);
    const addrKnown = addrCity && placeNames.has(tidyCity(addrCity).toLowerCase());
    const near = addrKnown ? null : nearestPlace(lat, lon);
    const city = addrKnown ? tidyCity(addrCity) : near ? near.name : addrCity ? tidyCity(addrCity) : undefined;
    const suburbFromAddrCity = !addrKnown && near && addrCity ? tidyCity(addrCity) : undefined;
    if (!city) {
      drop("could not place in a city or town");
      continue;
    }
    const suburb = saneSuburb(suburbTag ?? suburbFromAddrCity);
    const phone = firstPhone(t);
    const site = website(t);
    if (!phone && !site && !street) {
      drop("no phone, website or street address");
      continue;
    }
    const quality = (phone ? 2 : 0) + (site ? 2 : 0) + (street ? 2 : 0) + (suburb ? 1 : 0) + (postcode ? 1 : 0) + (addrCity ? 1 : 0) + (cls.speciality ? 1 : 0);
    const rec = { id, name, kind: cls.kind, speciality: cls.speciality, street, suburb: suburb && suburb !== city ? suburb : undefined, city, province, postcode, lat: +lat.toFixed(5), lon: +lon.toFixed(5), phone, website: site, quality };
    for (const k of Object.keys(rec)) if (rec[k] === undefined) delete rec[k];
    records.push(rec);
  }
}

// De-duplicate: the same name in (almost) the same place, or the same name and phone, is one practice. Keep the fuller entry.
const best = new Map();
const keep = (key, rec) => {
  const cur = best.get(key);
  if (!cur || rec.quality > cur.quality) best.set(key, rec);
  return cur ? cur.id : null;
};
const dupeOf = new Map();
for (const rec of [...records].sort((a, b) => b.quality - a.quality || a.id.localeCompare(b.id))) {
  const k1 = `${fold(rec.name)}|${rec.lat.toFixed(3)}|${rec.lon.toFixed(3)}`;
  const k2 = rec.phone ? `${fold(rec.name)}|${rec.phone}` : null;
  const hit = best.has(k1) || (k2 && best.has(k2));
  if (hit) {
    dupeOf.set(rec.id, true);
    continue;
  }
  keep(k1, rec);
  if (k2) keep(k2, rec);
}
const unique = records.filter((r) => !dupeOf.has(r.id));
report.dropped["duplicate of a fuller entry"] = records.length - unique.length;

unique.sort((a, b) => b.quality - a.quality || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
report.kept = unique.length;
const count = (key) => unique.reduce((m, r) => ((m[r[key]] = (m[r[key]] ?? 0) + 1), m), {});
report.byKind = count("kind");
report.byProvince = count("province");
report.cities = Object.keys(count("city")).length;
report.withPhone = unique.filter((r) => r.phone).length;
report.withWebsite = unique.filter((r) => r.website).length;
report.withStreet = unique.filter((r) => r.street).length;

writeFileSync(path.join(OUT, "prepared.json"), JSON.stringify(unique));
writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
