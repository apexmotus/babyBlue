// Builds public/demo-db.tar.gz: a ready-to-load PostgreSQL data directory with the schema and fictional demo data.
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { SQL_FILES } from "../src/local/sql.generated.ts";
import { seedDemoData } from "../src/local/seed.ts";

const t0 = Date.now();
const db = new PGlite({ extensions: { btree_gist, pgcrypto } });
for (const f of SQL_FILES) await db.exec(f.sql);
await seedDemoData(db);
const blob = await db.dumpDataDir("gzip");
mkdirSync("public", { recursive: true });
writeFileSync("public/demo-db.tar.gz", Buffer.from(await blob.arrayBuffer()));
console.log(`snapshot: ${(blob.size / 1024 / 1024).toFixed(1)} MB in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
await db.close();
