import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { en } from '../src/i18n/en.mjs'
import { th } from '../src/i18n/th.mjs'
import { makeT, registerOverride } from '../src/i18n/index.mjs'
import { validateWorkerCategories, syncTaxonomy, operatorCategories } from '../src/lib/taxonomy.mjs'
import { freshDb, makeOperator } from './helpers.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

test('th pack covers every en key (no missing translations)', () => {
  const missing = Object.keys(en).filter((k) => !(k in th))
  assert.deepEqual(missing, [], `th missing keys: ${missing.join(', ')}`)
})

test('th pack has no keys absent from the en schema', () => {
  const extra = Object.keys(th).filter((k) => !(k in en))
  assert.deepEqual(extra, [], `th has stray keys: ${extra.join(', ')}`)
})

test('t() interpolates params and falls back to en then key', () => {
  const tEn = makeT('en')
  assert.equal(tEn('common.yearsExp', { n: 5 }), '5 yrs experience')
  assert.equal(tEn('does.not.exist'), 'does.not.exist')
  const tTh = makeT('th')
  assert.equal(tTh('dir.count', { n: 12 }), '12 คน')
})

test('operator override wins for its key, base pack otherwise', () => {
  registerOverride('op1', 'en', { 'app.tagline': 'Custom {city} help' })
  const t = makeT('en', 'op1')
  assert.equal(t('app.tagline', { city: 'CM' }), 'Custom CM help')
  assert.equal(t('nav.directory'), 'Find help') // non-overridden falls through
})

test('every operator category label_key resolves in both locales', () => {
  const config = JSON.parse(readFileSync(join(ROOT, 'tenants', 'chiangmai.json'), 'utf8'))
  const tEn = makeT('en'), tTh = makeT('th')
  for (const c of operatorCategories(config)) {
    assert.notEqual(tEn(c.label_key), c.label_key, `en label for ${c.key}`)
    assert.notEqual(tTh(c.label_key), c.label_key, `th label for ${c.key}`)
  }
})

// ---- title guard (§5) ----------------------------------------------------
test('title guard: licensed category rejected without a licence number', () => {
  const config = {
    categories: [
      { key: 'housekeeper', label_key: 'cat.housekeeper' },
      { key: 'nurse', label_key: 'cat.nurse', requires_license: true },
    ],
  }
  assert.equal(validateWorkerCategories(config, ['housekeeper']).ok, true)
  const noLicence = validateWorkerCategories(config, ['nurse'])
  assert.equal(noLicence.ok, false)
  assert.match(noLicence.errors[0], /licence number/)
  assert.equal(validateWorkerCategories(config, ['nurse'], { licenseNumber: '12345' }).ok, true)
  // a category not enabled for the operator is rejected (no free-text bypass)
  assert.equal(validateWorkerCategories(config, ['doctor']).ok, false)
})

test('syncTaxonomy upserts categories + zones idempotently', async () => {
  const db = freshDb()
  const { config } = await makeOperator(db, 'cm', {
    config: JSON.parse(readFileSync(join(ROOT, 'tenants', 'chiangmai.json'), 'utf8')),
  })
  await syncTaxonomy(db, 'cm', config)
  const n1 = (await db.get('SELECT count(*) c FROM service_category WHERE operator_id=?', 'cm')).c
  assert.equal(n1, config.categories.length)
  await syncTaxonomy(db, 'cm', config) // re-run
  const n2 = (await db.get('SELECT count(*) c FROM service_category WHERE operator_id=?', 'cm')).c
  assert.equal(n2, n1, 'idempotent — no duplicate rows')
  const zones = (await db.get('SELECT count(*) c FROM zone WHERE operator_id=?', 'cm')).c
  assert.equal(zones, config.zones.length)
})
