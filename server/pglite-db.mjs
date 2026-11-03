// PGlite (Postgres in WebAssembly) als Datenbank für lokale Entwicklung und Tests.
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const here = dirname(fileURLToPath(import.meta.url));
export const MIGRATIONS_DIR = join(here, '..', 'netlify', 'database', 'migrations');

/** Gleiche Typen wie in Produktion (siehe pgDb in netlify/lib/db.mts). */
const parsers = {
  1082: (v) => v, // date
  1700: (v) => parseFloat(v), // numeric
  20: (v) => parseInt(v, 10), // int8
};

export async function openPglite(dataDir) {
  const pg = new PGlite(dataDir, { parsers });
  await migrate(pg);
  return pg;
}

/** Führt noch nicht angewendete Migrationen aus (wie Netlify beim Deploy). */
export async function migrate(pg) {
  await pg.exec(`create schema if not exists dev_meta;
    create table if not exists dev_meta.migrations (name text primary key, applied_at timestamptz default now());`);
  const done = new Set((await pg.query(`select name from dev_meta.migrations`)).rows.map((r) => r.name));
  for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()) {
    if (done.has(file)) continue;
    await pg.transaction(async (tx) => {
      await tx.exec(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));
      await tx.query(`insert into dev_meta.migrations (name) values ($1)`, [file]);
    });
  }
}

/** Db-Interface aus netlify/lib/db.mts. */
export function pgliteDb(pg) {
  return {
    transaction(fn) {
      return pg.transaction((tx) => fn({ query: (sql, params) => tx.query(sql, params, { parsers }) }));
    },
  };
}
