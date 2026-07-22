// repo.mjs — tenant-scoped data access. EVERY function takes operatorId and
// includes it in every WHERE clause; the isolation suite (test/tenant.test.mjs)
// guards the tables, and these functions never query without the scope. No SQL
// lives in route handlers.
import { randomUUID } from 'node:crypto'
import { validateWorkerCategories } from './lib/taxonomy.mjs'

const now = () => new Date().toISOString().slice(0, 19).replace('T', ' ')

/** Create a worker profile + its multi-valued rows. Validates categories
 *  against the operator taxonomy + title guard (§5). Returns the new id. */
export async function createWorker(db, operatorId, config, input) {
  const v = validateWorkerCategories(config, input.categories, { licenseNumber: input.licenseNumber })
  if (!v.ok) { const e = new Error('invalid categories'); e.details = v.errors; throw e }
  const id = randomUUID()
  const headline = input.headline && input.categories.includes(input.headline)
    ? input.headline : input.categories[0]
  await db.run(
    `INSERT INTO worker_profile(id, user_id, operator_id, headline_category, about_en,
       about_th, years_experience, live_in_possible, availability_json, verification_tier,
       license_number, certificate_note, active, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    id, input.userId, operatorId, headline, input.about_en ?? '', input.about_th ?? '',
    input.years_experience ?? null, input.live_in_possible ? 1 : 0,
    JSON.stringify(input.availability ?? {}), input.verification_tier ?? 'T0',
    input.licenseNumber ?? null, input.certificate_note ?? null,
    input.active === false ? 0 : 1, now(), now())
  for (const c of input.categories)
    await db.run('INSERT INTO worker_category(worker_id, operator_id, category_key) VALUES (?,?,?)', id, operatorId, c)
  for (const z of input.zones ?? [])
    await db.run('INSERT INTO worker_zone(worker_id, operator_id, zone_key) VALUES (?,?,?)', id, operatorId, z)
  for (const l of input.languages ?? [])
    await db.run('INSERT INTO worker_language(worker_id, operator_id, lang) VALUES (?,?,?)', id, operatorId, l)
  for (const e of input.engagements ?? [])
    await db.run('INSERT INTO worker_engagement(worker_id, operator_id, engagement_type) VALUES (?,?,?)', id, operatorId, e)
  for (const r of input.rates ?? [])
    await db.run(
      'INSERT INTO rate_card(id, worker_id, operator_id, category_key, amount, unit, negotiable) VALUES (?,?,?,?,?,?,?)',
      randomUUID(), id, operatorId, r.category_key, r.amount ?? null, r.unit, r.negotiable === false ? 0 : 1)
  return id
}

/** Full worker profile (scoped) with all child rows, or null. */
export async function getWorker(db, operatorId, workerId) {
  const w = await db.get(
    `SELECT wp.*, u.display_name AS display_name, u.claimed AS claimed
       FROM worker_profile wp JOIN app_user u ON u.id = wp.user_id
      WHERE wp.operator_id=? AND wp.id=?`, operatorId, workerId)
  if (!w) return null
  const [categories, zones, languages, engagements, rates] = await Promise.all([
    db.all('SELECT category_key FROM worker_category WHERE operator_id=? AND worker_id=?', operatorId, workerId),
    db.all('SELECT zone_key FROM worker_zone WHERE operator_id=? AND worker_id=?', operatorId, workerId),
    db.all('SELECT lang FROM worker_language WHERE operator_id=? AND worker_id=?', operatorId, workerId),
    db.all('SELECT engagement_type FROM worker_engagement WHERE operator_id=? AND worker_id=?', operatorId, workerId),
    db.all('SELECT category_key, amount, unit, negotiable FROM rate_card WHERE operator_id=? AND worker_id=?', operatorId, workerId),
  ])
  return {
    ...w,
    live_in_possible: !!w.live_in_possible,
    assisted: !w.claimed, // admin-assisted, not yet claimed by the worker (§7.1)
    categories: categories.map((r) => r.category_key),
    zones: zones.map((r) => r.zone_key),
    languages: languages.map((r) => r.lang),
    engagements: engagements.map((r) => r.engagement_type),
    rates,
  }
}

const REPLY_ORDER = { within_hour: 0, within_day: 1, few_days: 2, slow: 3 }

/** Directory listing (scoped) with multi-valued filters. filters:
 *  {category, zone, language, tier, engagement, sort}. Filters are AND-combined;
 *  a null/absent filter is ignored. sort ∈ {recent, reply}. */
export async function listWorkers(db, operatorId, filters = {}) {
  const where = ['w.operator_id = ?', 'w.active = 1']
  const params = [operatorId]
  const existsJoin = (table, col, val) => {
    where.push(`EXISTS (SELECT 1 FROM ${table} x WHERE x.worker_id=w.id AND x.operator_id=? AND x.${col}=?)`)
    params.push(operatorId, val)
  }
  if (filters.category) existsJoin('worker_category', 'category_key', filters.category)
  if (filters.zone) existsJoin('worker_zone', 'zone_key', filters.zone)
  if (filters.language) existsJoin('worker_language', 'lang', filters.language)
  if (filters.engagement) existsJoin('worker_engagement', 'engagement_type', filters.engagement)
  if (filters.tier) { where.push('w.verification_tier = ?'); params.push(filters.tier) }

  const rows = await db.all(
    `SELECT w.* FROM worker_profile w WHERE ${where.join(' AND ')} ORDER BY w.created_at DESC`, ...params)
  const full = []
  for (const w of rows) full.push(await getWorker(db, operatorId, w.id))
  if (filters.sort === 'reply')
    full.sort((a, b) => (REPLY_ORDER[a.reply_bucket] ?? 9) - (REPLY_ORDER[b.reply_bucket] ?? 9))
  return full
}
