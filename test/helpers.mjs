// helpers.mjs — shared test scaffolding. Applies the real migrations to an
// in-memory node:sqlite DB before each suite, so tests run against the exact
// D1 schema (§11.1). Also seeds two operators for tenant-isolation tests.

import { DatabaseSync } from 'node:sqlite'
import { nodeDb } from '../src/db.mjs'
import { migrateNode } from '../src/migrate.mjs'

/** Fresh migrated DB + adapter. */
export function freshDb() {
  const raw = new DatabaseSync(':memory:')
  migrateNode(raw)
  return nodeDb(raw)
}

let counter = 0
const uid = (p) => `${p}-${(counter++).toString(36)}`

/** Insert an operator row with a minimal valid config. */
export async function makeOperator(db, id, over = {}) {
  const config = {
    brandName: over.brandName ?? `Brand ${id}`,
    theme: over.theme ?? { bg: '#101014', text: '#f2f2f2', accent: '#e2a63d' },
    locales: over.locales ?? ['th', 'en'],
    defaultLocale: over.defaultLocale ?? 'th',
    ...over.config,
  }
  await db.run(
    'INSERT INTO operator(id, hostname, brand_name, config_json) VALUES (?,?,?,?)',
    id, over.hostname ?? `${id}.example.com`, config.brandName, JSON.stringify(config))
  return { id, config }
}

/** Insert a user under an operator. */
export async function makeUser(db, operatorId, over = {}) {
  const id = over.id ?? uid('u')
  await db.run(
    `INSERT INTO app_user(id, operator_id, phone, phone_verified, display_name,
       is_customer, is_worker, is_admin, claimed, claim_phone)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    id, operatorId, over.phone ?? null, over.phone_verified ?? 0,
    over.display_name ?? 'Test User',
    over.is_customer ?? 0, over.is_worker ?? 1, over.is_admin ?? 0,
    over.claimed ?? 1, over.claim_phone ?? null)
  return id
}

/** Insert a worker profile (+ optional category/zone/language rows). */
export async function makeWorker(db, operatorId, userId, over = {}) {
  const id = over.id ?? uid('w')
  await db.run(
    `INSERT INTO worker_profile(id, user_id, operator_id, headline_category,
       about_en, about_th, years_experience, live_in_possible, verification_tier, active)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    id, userId, operatorId, over.headline_category ?? 'housekeeper',
    over.about_en ?? '', over.about_th ?? '', over.years_experience ?? null,
    over.live_in_possible ?? 0, over.verification_tier ?? 'T0', over.active ?? 1)
  for (const c of over.categories ?? [over.headline_category ?? 'housekeeper'])
    await db.run('INSERT INTO worker_category(worker_id, operator_id, category_key) VALUES (?,?,?)', id, operatorId, c)
  for (const z of over.zones ?? [])
    await db.run('INSERT INTO worker_zone(worker_id, operator_id, zone_key) VALUES (?,?,?)', id, operatorId, z)
  for (const l of over.languages ?? [])
    await db.run('INSERT INTO worker_language(worker_id, operator_id, lang) VALUES (?,?,?)', id, operatorId, l)
  return id
}
