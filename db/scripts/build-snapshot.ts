// Builds public/demo-db.tar.gz: a ready-to-load PostgreSQL data directory with the schema and fictional demo data.
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { SQL_FILES } from "../../packages/pglite-demo/src/sql.generated.ts";
import { seedDemoData } from "../../packages/pglite-demo/src/seed.ts";

const t0 = Date.now();
const db = new PGlite({ extensions: { btree_gist, pgcrypto } });
for (const f of SQL_FILES) await db.exec(f.sql);
await seedDemoData(db);
const blob = await db.dumpDataDir("gzip");
const buffer = Buffer.from(await blob.arrayBuffer());

// Both Next.js apps load the same PGlite demo snapshot client-side, so each needs its own copy
// in its own public/ directory.
for (const appDir of ["client-web", "admin-dashboard"]) {
  const publicDir = path.resolve(import.meta.dirname, "../..", appDir, "public");
  mkdirSync(publicDir, { recursive: true });
  writeFileSync(path.join(publicDir, "demo-db.tar.gz"), buffer);
}
console.log(`snapshot: ${(blob.size / 1024 / 1024).toFixed(1)} MB in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
await db.close();
