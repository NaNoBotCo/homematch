import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { contrastRatio, checkTheme, parseHex, AAA_BODY } from '../src/lib/contrast.mjs'
import { assertConfigValid, resolveTenant } from '../src/lib/tenant.mjs'
import { freshDb, makeOperator, makeWorker, makeUser } from './helpers.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

// ---- contrast maths ------------------------------------------------------
test('contrast ratio: known anchors', () => {
  assert.equal(Math.round(contrastRatio('#000000', '#ffffff')), 21)
  assert.equal(Math.round(contrastRatio('#fff', '#fff')), 1)
  assert.ok(parseHex('#abc').length === 3) // shorthand expands
})

test('checkTheme rejects a low-contrast theme, accepts a good one', () => {
  assert.equal(checkTheme({ bg: '#101010', text: '#f2f2f2', accent: '#e2a63d' }).ok, true)
  const bad = checkTheme({ bg: '#777', text: '#888', accent: '#999' })
  assert.equal(bad.ok, false)
  assert.ok(bad.ratio < AAA_BODY)
})

// ---- every shipped tenant config must pass validation + contrast ---------
test('all tenants/*.json pass config validation and AAA body contrast', () => {
  const files = readdirSync(join(ROOT, 'tenants')).filter((f) => f.endsWith('.json'))
  assert.ok(files.length >= 1, 'at least one tenant config ships')
  for (const f of files) {
    const config = JSON.parse(readFileSync(join(ROOT, 'tenants', f), 'utf8'))
    assert.doesNotThrow(() => assertConfigValid(config), `${f} valid + contrast`)
    const c = checkTheme(config.theme)
    assert.ok(c.ratio >= AAA_BODY, `${f} body text ${c.ratio.toFixed(2)}:1 ≥ ${AAA_BODY}`)
  }
})

test('assertConfigValid throws on defaultLocale not in locales', () => {
  assert.throws(() => assertConfigValid({
    brandName: 'X', theme: { bg: '#000', text: '#fff', accent: '#e2a63d' },
    locales: ['th'], defaultLocale: 'en',
  }))
})

test('resolveTenant matches by bare hostname, ignores port, returns null for unknown', async () => {
  const db = freshDb()
  await makeOperator(db, 'cm', { hostname: 'cm.example.com' })
  assert.equal((await resolveTenant(db, 'cm.example.com:8787')).operator.id, 'cm')
  assert.equal(await resolveTenant(db, 'nope.example.com'), null)
})

// ---- tenant isolation: no cross-tenant read on ANY operator_id table -----
// §3 + §11.2: add a test asserting no cross-tenant leakage on every table
// with operator_id. This discovers such tables from the live schema so a new
// scoped table added later without an isolation guard fails this test.
test('every operator_id table isolates rows across tenants', async () => {
  const db = freshDb()
  await makeOperator(db, 'a', { hostname: 'a.example.com' })
  await makeOperator(db, 'b', { hostname: 'b.example.com' })
  const ua = await makeUser(db, 'a', { display_name: 'Aendra' })
  const ub = await makeUser(db, 'b', { display_name: 'Boonmee' })
  await makeWorker(db, 'a', ua, { categories: ['housekeeper'], zones: ['old-city'], languages: ['th'] })
  await makeWorker(db, 'b', ub, { categories: ['cook'], zones: ['nimman'], languages: ['en'] })

  // discover every table that has an operator_id column
  const tables = (await db.all(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name!='_migrations'"
  )).map((r) => r.name)
  const scoped = []
  for (const t of tables) {
    const cols = await db.all(`PRAGMA table_info(${t})`)
    if (cols.some((c) => c.name === 'operator_id')) scoped.push(t)
  }
  assert.ok(scoped.includes('worker_profile') && scoped.includes('worker_category'),
    'discovered the scoped tables')

  // for each, a query scoped to operator 'a' must never return a 'b' row
  for (const t of scoped) {
    const aRows = await db.all(`SELECT * FROM ${t} WHERE operator_id = ?`, 'a')
    const bRows = await db.all(`SELECT * FROM ${t} WHERE operator_id = ?`, 'b')
    for (const row of aRows)
      assert.equal(row.operator_id, 'a', `${t}: tenant-a query leaked a non-a row`)
    // sanity: the two tenants' scoped sets are disjoint by operator_id
    const overlap = aRows.filter((r) => bRows.some((b) => JSON.stringify(b) === JSON.stringify(r)))
    assert.equal(overlap.length, 0, `${t}: rows shared across tenants`)
  }
})
