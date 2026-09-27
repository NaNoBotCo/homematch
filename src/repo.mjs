// repo.mjs — tenant-scoped data access. EVERY function takes operatorId and
// includes it in every WHERE clause; the isolation suite (test/tenant.test.mjs)
// guards the tables, and these functions never query without the scope. No SQL
// lives in route handlers.
import { randomUUID, randomBytes, createHash } from 'node:crypto'
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

// ── self-listing (0005) ─────────────────────────────────────────────────────
// A listing is a worker_profile + its user row, created by the worker through
// the join form. It starts 'pending' (active=0) and shows only once the
// operator approves it. The private edit link carries a random token; only its
// sha256 is stored.

const sha256 = (s) => createHash('sha256').update(String(s)).digest('hex')
export const newToken = () => randomBytes(24).toString('base64url')

const STATUS_ACTIVE = { pending: 0, live: 1, hidden: 0 }

/** Create a self-listing. `input` is a validated listing (see
 *  lib/listing.mjs); input.status 'live' when the bot approved it, else it
 *  waits as 'pending'. Returns { id, token }. */
export async function createListing(db, operatorId, config, input) {
  const userId = randomUUID()
  await db.run(
    `INSERT INTO app_user(id, operator_id, display_name, is_worker, claimed) VALUES (?,?,?,1,1)`,
    userId, operatorId, input.display_name)
  const id = await createWorker(db, operatorId, config, { ...input, userId, active: false })
  const token = newToken()
  const status = input.status === 'live' ? 'live' : 'pending'
  await db.run(
    `UPDATE worker_profile SET status=?, active=?, contact_line=?, contact_phone=?, indexable=?,
       edit_hash=?, consent_at=? WHERE operator_id=? AND id=?`,
    status, STATUS_ACTIVE[status], input.contact_line, input.contact_phone, input.indexable ? 1 : 0,
    sha256(token), now(), operatorId, id)
  return { id, token }
}

/** The listing a private edit token opens, or null. */
export async function findByEditToken(db, operatorId, token) {
  if (!token || token.length < 20) return null
  const row = await db.get(
    'SELECT id FROM worker_profile WHERE operator_id=? AND edit_hash=?', operatorId, sha256(token))
  return row ? getWorker(db, operatorId, row.id) : null
}

/** Replace a listing's fields and child rows. Returns { review, status }.
 *  With input.status (the bot's verdict) that decides; without it, a name or
 *  contact change on a live listing sends it back to 'pending'. */
export async function updateListing(db, operatorId, config, workerId, input) {
  const v = validateWorkerCategories(config, input.categories, {})
  if (!v.ok) { const e = new Error('invalid categories'); e.details = v.errors; throw e }
  const cur = await getWorker(db, operatorId, workerId)
  if (!cur) return null
  const changed = cur.display_name !== input.display_name ||
    (cur.contact_line || null) !== (input.contact_line || null) ||
    (cur.contact_phone || null) !== (input.contact_phone || null)
  let review = changed && cur.status === 'live'
  let status = review ? 'pending' : cur.status
  // the bot's verdict, when there is one; a listing the operator took down
  // stays down whatever its owner edits
  if (input.status && cur.status !== 'hidden') {
    status = input.status
    review = status === 'pending'
  }
  await db.run('UPDATE app_user SET display_name=? WHERE operator_id=? AND id=?',
    input.display_name, operatorId, cur.user_id)
  const headline = input.categories[0]
  await db.run(
    `UPDATE worker_profile SET headline_category=?, about_en=?, about_th=?, years_experience=?,
       live_in_possible=?, contact_line=?, contact_phone=?, indexable=?, status=?, active=?, updated_at=?
     WHERE operator_id=? AND id=?`,
    headline, input.about_en ?? '', input.about_th ?? '', input.years_experience ?? null,
    input.live_in_possible ? 1 : 0, input.contact_line, input.contact_phone,
    input.indexable ? 1 : 0, status, STATUS_ACTIVE[status] ?? 0, now(), operatorId, workerId)
  await deleteChildren(db, operatorId, workerId)
  for (const c of input.categories)
    await db.run('INSERT INTO worker_category(worker_id, operator_id, category_key) VALUES (?,?,?)', workerId, operatorId, c)
  for (const z of input.zones ?? [])
    await db.run('INSERT INTO worker_zone(worker_id, operator_id, zone_key) VALUES (?,?,?)', workerId, operatorId, z)
  for (const l of input.languages ?? [])
    await db.run('INSERT INTO worker_language(worker_id, operator_id, lang) VALUES (?,?,?)', workerId, operatorId, l)
  for (const e of input.engagements ?? [])
    await db.run('INSERT INTO worker_engagement(worker_id, operator_id, engagement_type) VALUES (?,?,?)', workerId, operatorId, e)
  for (const r of input.rates ?? [])
    await db.run(
      'INSERT INTO rate_card(id, worker_id, operator_id, category_key, amount, unit, negotiable) VALUES (?,?,?,?,?,?,?)',
      randomUUID(), workerId, operatorId, r.category_key, r.amount ?? null, r.unit, r.negotiable === false ? 0 : 1)
  return { review, status }
}

async function deleteChildren(db, operatorId, workerId) {
  for (const t of ['worker_category', 'worker_zone', 'worker_language', 'worker_engagement', 'rate_card'])
    await db.run(`DELETE FROM ${t} WHERE operator_id=? AND worker_id=?`, operatorId, workerId)
}

/** Delete a listing, its child rows and its user row. */
export async function removeListing(db, operatorId, workerId) {
  const cur = await db.get('SELECT user_id FROM worker_profile WHERE operator_id=? AND id=?', operatorId, workerId)
  if (!cur) return false
  await deleteChildren(db, operatorId, workerId)
  await db.run('DELETE FROM worker_photo WHERE operator_id=? AND worker_id=?', operatorId, workerId)
  await db.run('DELETE FROM worker_profile WHERE operator_id=? AND id=?', operatorId, workerId)
  await db.run('DELETE FROM verification_record WHERE operator_id=? AND user_id=?', operatorId, cur.user_id)
  await db.run('DELETE FROM app_user WHERE operator_id=? AND id=?', operatorId, cur.user_id)
  return true
}

/** Operator moderation: pending → live, live → hidden, and back. */
export async function setListingStatus(db, operatorId, workerId, status) {
  if (!(status in STATUS_ACTIVE)) throw new Error('bad status ' + status)
  const r = await db.run('UPDATE worker_profile SET status=?, active=?, updated_at=? WHERE operator_id=? AND id=?',
    status, STATUS_ACTIVE[status], now(), operatorId, workerId)
  return r.changes > 0
}

/** Listings in one status, newest first, full rows. */
export async function listByStatus(db, operatorId, status) {
  const rows = await db.all(
    'SELECT id FROM worker_profile WHERE operator_id=? AND status=? ORDER BY updated_at DESC', operatorId, status)
  const out = []
  for (const r of rows) out.push(await getWorker(db, operatorId, r.id))
  return out
}

/** Record one form submission from `ipHash` and return how many it has made
 *  in the last 24 hours, this one included. */
export async function countAttempt(db, operatorId, ipHash) {
  await db.run('INSERT INTO listing_attempt(operator_id, ip_hash, created_at) VALUES (?,?,?)', operatorId, ipHash, now())
  await db.run("DELETE FROM listing_attempt WHERE created_at < datetime('now','-2 days')")
  const r = await db.get(
    "SELECT COUNT(*) AS n FROM listing_attempt WHERE operator_id=? AND ip_hash=? AND created_at >= datetime('now','-1 day')",
    operatorId, ipHash)
  return r?.n ?? 0
}

export { sha256 }

// ── approval bot + digest (0006) ────────────────────────────────────────────

/** Append one event. `detail` is stored as JSON. */
export async function logEvent(db, operatorId, kind, { workerId = null, ipHash = null, name = null, detail = null } = {}) {
  await db.run(
    'INSERT INTO listing_event(operator_id, at, kind, worker_id, ip_hash, name, detail) VALUES (?,?,?,?,?,?,?)',
    operatorId, now(), kind, workerId, ipHash, name, detail == null ? null : JSON.stringify(detail))
}

/** What the bot knows about a sender and a contact before it decides.
 *  sameContact = other listings carrying this phone or LINE ID;
 *  sameSender = listings this connection sent in the last 24 h. */
export async function screenHistory(db, operatorId, { phone, line, ipHash, excludeId = null }) {
  const c = await db.get(
    `SELECT COUNT(*) AS n FROM worker_profile WHERE operator_id=? AND id IS NOT ?
       AND ((? IS NOT NULL AND contact_phone=?) OR (? IS NOT NULL AND lower(contact_line)=lower(?)))`,
    operatorId, excludeId, phone, phone, line, line)
  const s = ipHash ? await db.get(
    `SELECT COUNT(*) AS n FROM listing_event WHERE operator_id=? AND ip_hash=? AND kind IN ('approve','hold')
       AND at >= datetime('now','-1 day')`, operatorId, ipHash) : { n: 0 }
  // a connection that sent a sexual photo in the last 7 days
  const x = ipHash ? await db.get(
    `SELECT COUNT(*) AS n FROM listing_event WHERE operator_id=? AND ip_hash=? AND kind='photo-refuse'
       AND detail LIKE '%"why":"sexual"%' AND at >= datetime('now','-7 days')`, operatorId, ipHash) : { n: 0 }
  return { sameContact: c?.n ?? 0, sameSender: s?.n ?? 0, sexualPhoto: x?.n ?? 0 }
}

export async function eventsAfter(db, operatorId, afterId) {
  return db.all('SELECT * FROM listing_event WHERE operator_id=? AND id>? ORDER BY id', operatorId, afterId)
}

export async function digestState(db, operatorId, kind) {
  return (await db.get('SELECT * FROM digest_state WHERE operator_id=? AND kind=?', operatorId, kind))
    ?? { operator_id: operatorId, kind, last_event_id: 0, sent_at: null }
}

export async function saveDigestState(db, operatorId, kind, lastEventId, sentAt) {
  await db.run(
    `INSERT INTO digest_state(operator_id, kind, last_event_id, sent_at) VALUES (?,?,?,?)
     ON CONFLICT(operator_id, kind) DO UPDATE SET last_event_id=excluded.last_event_id, sent_at=excluded.sent_at`,
    operatorId, kind, lastEventId, sentAt)
}

export async function statusCounts(db, operatorId) {
  const rows = await db.all('SELECT status, COUNT(*) AS n FROM worker_profile WHERE operator_id=? GROUP BY status', operatorId)
  return Object.fromEntries(rows.map((r) => [r.status, r.n]))
}

export async function selfListingOperators(db) {
  const rows = await db.all('SELECT id, config_json FROM operator')
  return rows.map((r) => ({ id: r.id, config: JSON.parse(r.config_json) })).filter((o) => o.config.selfListing)
}

// ── photos ──────────────────────────────────────────────────────────────────
export async function addPhoto(db, operatorId, workerId, { id, key, mime, status, what, sort }) {
  await db.run(
    'INSERT INTO worker_photo(id, worker_id, operator_id, r2_key, sort, status, mime, what, created_at) VALUES (?,?,?,?,?,?,?,?,?)',
    id, workerId, operatorId, key, sort ?? 0, status, mime, what ?? null, now())
}
export async function listPhotos(db, operatorId, workerId) {
  return db.all('SELECT * FROM worker_photo WHERE operator_id=? AND worker_id=? ORDER BY sort, created_at', operatorId, workerId)
}
export async function getPhoto(db, operatorId, photoId) {
  return db.get(
    `SELECT p.*, w.active AS worker_active FROM worker_photo p JOIN worker_profile w ON w.id=p.worker_id
      WHERE p.operator_id=? AND p.id=?`, operatorId, photoId)
}
export async function deletePhoto(db, operatorId, photoId) {
  await db.run('DELETE FROM worker_photo WHERE operator_id=? AND id=?', operatorId, photoId)
}
export async function setPhotoStatus(db, operatorId, photoId, status) {
  await db.run('UPDATE worker_photo SET status=? WHERE operator_id=? AND id=?', status, operatorId, photoId)
}
export async function heldPhotos(db, operatorId) {
  return db.all(
    `SELECT p.*, u.display_name FROM worker_photo p JOIN worker_profile w ON w.id=p.worker_id
       JOIN app_user u ON u.id=w.user_id WHERE p.operator_id=? AND p.status='held' ORDER BY p.created_at`, operatorId)
}
