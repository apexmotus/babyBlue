# Practice directory data

Real practices, released in batches of 100 into `src/data/practices/batch-NNN.json`. A batch is live once `src/data/practices/index.ts` lists it.

## Where it comes from

OpenStreetMap, through the Overpass API, in one polite pass (`scripts/directory/fetch-osm.mjs`): every named feature tagged as a hospital, clinic, doctor, dentist or other health professional inside South Africa's nine provinces, plus the cities and towns used to name the area of entries that have no address city.

- © OpenStreetMap contributors, available under the Open Database Licence (ODbL) 1.0. https://www.openstreetmap.org/copyright
- Every record keeps its OpenStreetMap id (`n` node, `w` way, `r` relation), so it can be traced and corrected at the source. The date retrieved is in `src/data/practices/source.json`.
- Attribution is shown wherever the data is shown (`DirectoryAttribution`).

## What is kept and what is not (`scripts/directory/build-dataset.mjs`)

Kept: name, kind, tagged speciality, street, suburb, city, province, postcode, coordinates, and a phone number and website **only if the practice's own entry publishes them under its business tags**. Entries need a phone, website or street address, so there is something a person can use. Duplicates are merged (same name in the same place, or same name and phone).

Never kept: email addresses (never read), personal or WhatsApp mobile tags, opening-hours text, photos, reviews or ratings (OpenStreetMap has none, and copying them from Google or others is not allowed), pharmacies, laboratories, blood and sample collection points. Nothing is invented: a field is either published in the source or absent.

City: the entry's own address city when it has one, otherwise the nearest city or town (within 35 km) from OpenStreetMap's own place nodes. Province: the province whose boundary the entry sits inside.

## Rules for using it

- These practices are **not on BabyBlue**: no diary, no bookings, nothing verified. Every card says so. Never show a booking button or a "verified" badge for them.
- No reviews, ratings or endorsements, and nothing that implies a partnership.
- Do not publish the raw data or add an API that returns full records. ODbL share-alike would then apply to BabyBlue's own database. Showing pages and cards (a "produced work") with attribution is fine.
- Do not use these contact details for marketing (POPIA section 69). They are shown so people can find and call a practice.
- A practice can ask to be removed (`Privacy request (POPIA)` on the contact form, quoting its id) or fix its details at the source. **Before the site is allowed into search engines, a monitored address and working storage for that form must exist** (see COMPLIANCE.md).
- Data goes stale. Refetch, rebuild and release as new batches rather than editing released ones.

## Release a batch

```bash
node scripts/directory/fetch-osm.mjs <rawDir>                       # once
node scripts/directory/build-dataset.mjs <rawDir> <workDir>         # clean, de-duplicate, order
scripts/directory/release-batch.sh <n> <workDir>/prepared.json <rawDir>/meta.json
```

The release script emits batch `n`, runs the data tests and typecheck, commits on `dev`, merges `dev` to `staging` to `main`, deploys to production, then checks the live site (exact practice count, the new practice's page, key pages). It stops at the first failure.
