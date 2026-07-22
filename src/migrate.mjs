// migrate.mjs — apply numbered migrations/*.sql in order, from zero.
// Used by the dev server and by the test harness (which applies the schema
// before every suite). Verification requirement §11.1: "schema applies clean
// from zero and from every prior migration state." Each file is idempotent to
// re-apply only in the sense that we track applied files in _migrations.

import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const MIG_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations')

export function migrationFiles() {
  return readdirSync(MIG_DIR).filter((f) => /^\d+_.*\.sql$/.test(f)).sort()
}

/** Apply all pending migrations to a node:sqlite database (sync). Returns the
 *  list of files applied this call. `upTo` optionally stops after a file
 *  (lets tests assert intermediate migration states apply cleanly). */
export function migrateNode(database, { upTo } = {}) {
  database.exec(`CREATE TABLE IF NOT EXISTS _migrations (
    name TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now')))`)
  const done = new Set(
    database.prepare('SELECT name FROM _migrations').all().map((r) => r.name))
  const applied = []
  for (const f of migrationFiles()) {
    if (done.has(f)) continue
    const sql = readFileSync(join(MIG_DIR, f), 'utf8')
    database.exec(sql)
    database.prepare('INSERT INTO _migrations(name) VALUES (?)').run(f)
    applied.push(f)
    if (upTo && f === upTo) break
  }
  return applied
}
