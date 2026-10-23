/// <reference lib="webworker" />
import { PGlite } from "@electric-sql/pglite";
import { worker } from "@electric-sql/pglite/worker";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { SQL_FILES } from "./sql.generated.ts";
import { seedDemoData } from "./seed.ts";
import { REFRESH_SQL } from "./refresh.ts";

async function idbExists(name: string) {
  try {
    return (await indexedDB.databases()).some((d) => d.name === name);
  } catch {
    return false;
  }
}

/**
 * The BabyBlue local database: real PostgreSQL (PGlite) persisted in the browser's IndexedDB and shared by every tab.
 * First run loads a pre-built snapshot (schema + fictional demo data) so it is ready in seconds; later runs reopen the
 * existing database and just move the demo's clock forward.
 */
worker({
  async init(options) {
    const dataDir = options.dataDir as string;
    const extensions = { btree_gist, pgcrypto };
    let db: PGlite | null = null;

    if (!(await idbExists("/pglite/" + dataDir.replace("idb://", "")))) {
      try {
        const res = await fetch("/demo-db.tar.gz");
        if (res.ok) db = new PGlite({ dataDir, extensions, relaxedDurability: true, loadDataDir: await res.blob() });
      } catch {
        /* fall through to the slow path */
      }
    }
    db ??= new PGlite({ dataDir, extensions, relaxedDurability: true });
    await db.waitReady;

    const has = await db.query<{ ok: boolean }>("select to_regclass('public.practices') is not null as ok");
    if (!has.rows[0].ok) {
      // Slow path (snapshot unavailable): build everything in the browser.
      for (const f of SQL_FILES) await db.exec(f.sql);
      await seedDemoData(db);
    } else {
      await db.exec(REFRESH_SQL);
    }
    return db;
  },
});
