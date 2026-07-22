import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createWorker, getWorker, listWorkers } from '../src/repo.mjs'
import { syncTaxonomy } from '../src/lib/taxonomy.mjs'
import { freshDb, makeOperator, makeUser } from './helpers.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const cmConfig = () => JSON.parse(readFileSync(join(ROOT, 'tenants', 'chiangmai.json'), 'utf8'))

async function seeded() {
  const db = freshDb()
  const { config } = await makeOperator(db, 'cm', { config: cmConfig() })
  await syncTaxonomy(db, 'cm', config)
  const u1 = await makeUser(db, 'cm', { display_name: 'Nok' })
  const u2 = await makeUser(db, 'cm', { display_name: 'Malee' })
  const w1 = await createWorker(db, 'cm', config, {
    userId: u1, categories: ['housekeeper', 'cook'], zones: ['old-city', 'nimman'],
    languages: ['th', 'en'], engagements: ['task', 'long'], verification_tier: 'T1',
    rates: [{ category_key: 'housekeeper', amount: 400, unit: 'day' }],
  })
  const w2 = await createWorker(db, 'cm', config, {
    userId: u2, categories: ['cook'], zones: ['hang-dong'], languages: ['th'],
    engagements: ['short'], verification_tier: 'T0',
  })
  return { db, config, w1, w2 }
}

test('createWorker + getWorker round-trips all multi-valued fields', async () => {
  const { db, w1 } = await seeded()
  const w = await getWorker(db, 'cm', w1)
  assert.deepEqual(w.categories.sort(), ['cook', 'housekeeper'])
  assert.deepEqual(w.zones.sort(), ['nimman', 'old-city'])
  assert.deepEqual(w.languages.sort(), ['en', 'th'])
  assert.deepEqual(w.engagements.sort(), ['long', 'task'])
  assert.equal(w.rates[0].amount, 400)
  assert.equal(w.live_in_possible, false)
})

test('directory filters are AND-combined and scoped', async () => {
  const { db, w1, w2 } = await seeded()
  assert.equal((await listWorkers(db, 'cm', {})).length, 2)
  // category cook matches both; + zone old-city narrows to w1
  assert.deepEqual((await listWorkers(db, 'cm', { category: 'cook' })).map((w) => w.id).sort(), [w1, w2].sort())
  assert.deepEqual((await listWorkers(db, 'cm', { category: 'cook', zone: 'old-city' })).map((w) => w.id), [w1])
  // language en → only w1
  assert.deepEqual((await listWorkers(db, 'cm', { language: 'en' })).map((w) => w.id), [w1])
  // engagement short → only w2
  assert.deepEqual((await listWorkers(db, 'cm', { engagement: 'short' })).map((w) => w.id), [w2])
  // tier T1 → only w1
  assert.deepEqual((await listWorkers(db, 'cm', { tier: 'T1' })).map((w) => w.id), [w1])
  // impossible combo → empty
  assert.equal((await listWorkers(db, 'cm', { category: 'housekeeper', zone: 'hang-dong' })).length, 0)
})

test('createWorker enforces the title guard (licensed category needs a licence)', async () => {
  const db = freshDb()
  const config = {
    brandName: 'X', theme: { bg: '#000', text: '#fff', accent: '#e2a63d' },
    locales: ['th', 'en'], defaultLocale: 'th',
    categories: [{ key: 'nurse', label_key: 'cat.nurse', requires_license: true }],
    zones: [],
  }
  await makeOperator(db, 'op', { config })
  const u = await makeUser(db, 'op')
  await assert.rejects(
    createWorker(db, 'op', config, { userId: u, categories: ['nurse'] }),
    (e) => e.details?.some((m) => /licence number/.test(m)))
  // with a licence it succeeds
  const id = await createWorker(db, 'op', config, { userId: u, categories: ['nurse'], licenseNumber: 'RN-99' })
  assert.ok(id)
})

test('a directory query for one tenant never returns another tenant’s workers', async () => {
  const { db, config } = await seeded()
  await makeOperator(db, 'other', { hostname: 'other.example.com', config: cmConfig() })
  const uo = await makeUser(db, 'other', { display_name: 'Other' })
  await createWorker(db, 'other', config, { userId: uo, categories: ['cook'], zones: ['old-city'] })
  const cm = await listWorkers(db, 'cm', {})
  assert.ok(cm.every((w) => w.operator_id === 'cm'))
  assert.equal((await listWorkers(db, 'other', {})).length, 1)
})
