import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { migrateNode, migrationFiles } from '../src/migrate.mjs'
import { freshDb } from './helpers.mjs'

test('migrations apply clean from zero', () => {
  const db = new DatabaseSync(':memory:')
  const applied = migrateNode(db)
  assert.deepEqual(applied, migrationFiles(), 'all migration files applied in order')
  // every declared table exists
  const tables = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name!='_migrations'"
  ).all().map((r) => r.name)
  for (const t of ['operator', 'app_user', 'session', 'otp_challenge',
    'service_category', 'zone', 'worker_profile', 'worker_category',
    'worker_zone', 'worker_language', 'worker_engagement', 'rate_card',
    'worker_photo', 'verification_record'])
    assert.ok(tables.includes(t), `table ${t} created`)
})

test('migrations apply clean from every intermediate state', () => {
  // Apply up to each file into its own DB, then apply the rest — proves no
  // migration depends on a later one and each prior state is a valid stopping
  // point (§11.1 "from every prior migration state").
  for (const stop of migrationFiles()) {
    const db = new DatabaseSync(':memory:')
    const first = migrateNode(db, { upTo: stop })
    assert.ok(first.includes(stop))
    // now finish the rest — must not throw
    assert.doesNotThrow(() => migrateNode(db))
  }
})

test('migration runner is idempotent (re-run applies nothing)', () => {
  const db = new DatabaseSync(':memory:')
  migrateNode(db)
  const second = migrateNode(db)
  assert.deepEqual(second, [], 'second run applies no files')
})

test('helper freshDb yields a queryable adapter', async () => {
  const db = freshDb()
  const r = await db.get('SELECT count(*) AS n FROM operator')
  assert.equal(r.n, 0)
})
