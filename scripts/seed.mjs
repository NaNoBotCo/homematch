// seed.mjs — create the dev database: operator (mapped to localhost for local
// dev), taxonomy, and ~12 demo workers spanning categories/zones/tiers/langs,
// including admin-assisted (un-claimed) listings — how the first 20-50 real
// listings get seeded (§7.1). Deterministic-ish demo content, no real PII.
import { DatabaseSync } from 'node:sqlite'
import { readFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { nodeDb } from '../src/db.mjs'
import { migrateNode } from '../src/migrate.mjs'
import { syncTaxonomy } from '../src/lib/taxonomy.mjs'
import { createWorker } from '../src/repo.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
export const DB_PATH = process.env.HOMEMATCH_DB || join(ROOT, '.data', 'homematch.sqlite')

const DEMO = [
  { name: 'พี่นก Nok', cats: ['housekeeper', 'laundry'], zones: ['old-city', 'santitham'], langs: ['th'], tier: 'T1', eng: ['long', 'short'], yrs: 8, rate: { category_key: 'housekeeper', amount: 500, unit: 'day' }, reply: 'within_day', th: 'ทำความสะอาดบ้านและซักรีด ทำงานละเอียด', en: 'Housekeeping and laundry, careful and thorough.' },
  { name: 'ลุงสมชาย Somchai', cats: ['gardener', 'handyperson'], zones: ['hang-dong', 'saraphi'], langs: ['th'], tier: 'T2', eng: ['task', 'short'], yrs: 15, rate: { category_key: 'gardener', amount: 400, unit: 'visit' }, reply: 'within_day', en: 'Gardens and small home repairs.' },
  { name: 'Aye Aye', cats: ['housekeeper'], zones: ['nimman', 'santitham'], langs: ['my', 'th'], tier: 'T0', eng: ['long'], yrs: 3, rate: { category_key: 'housekeeper', amount: 12000, unit: 'month' }, reply: 'within_hour', assisted: true },
  { name: 'ครูแอน Ann', cats: ['tutor'], zones: ['nimman'], langs: ['th', 'en'], tier: 'T1', eng: ['short'], yrs: 6, rate: { category_key: 'tutor', amount: 350, unit: 'hour' }, reply: 'few_days', en: 'English and maths tutoring for primary/secondary.' },
  { name: 'พี่หมวย Muay', cats: ['cook', 'housekeeper'], zones: ['old-city'], langs: ['th'], tier: 'T1', eng: ['long'], yrs: 12, rate: { category_key: 'cook', amount: 15000, unit: 'month' }, reply: 'within_day' },
  { name: 'Khun Ploy', cats: ['nanny'], zones: ['san-sai', 'doi-saket'], langs: ['th', 'en'], tier: 'T2', eng: ['long'], yrs: 9, rate: { category_key: 'nanny', amount: 16000, unit: 'month' }, reply: 'within_day', en: 'Childcare, experienced with newborns.', liveIn: true },
  { name: 'พี่ตุ๊ก Tuk', cats: ['massage'], zones: ['chang-khlan'], langs: ['th'], tier: 'T1', eng: ['task'], yrs: 10, rate: { category_key: 'massage', amount: 300, unit: 'hour' }, reply: 'within_hour', cert: 'Thai Traditional Massage cert.' },
  { name: 'ช่างเอ Ae', cats: ['aircon', 'handyperson'], zones: ['mae-rim', 'san-sai'], langs: ['th'], tier: 'T0', eng: ['task'], yrs: 5, rate: { category_key: 'aircon', amount: 600, unit: 'visit' }, reply: 'few_days' },
  { name: 'Kyaw', cats: ['gardener'], zones: ['hang-dong'], langs: ['my', 'th'], tier: 'T0', eng: ['short', 'long'], yrs: 4, rate: { category_key: 'gardener', amount: 9000, unit: 'month' }, reply: 'none', assisted: true },
  { name: 'พี่แดง Daeng', cats: ['driver'], zones: ['old-city', 'chang-khlan'], langs: ['th', 'en'], tier: 'T1', eng: ['short', 'task'], yrs: 20, rate: { category_key: 'driver', amount: 1200, unit: 'day' }, reply: 'within_day', en: '20 years driving, airport and day trips.' },
  { name: 'Khun Fon', cats: ['caregiver', 'companion'], zones: ['saraphi', 'san-kamphaeng'], langs: ['th'], tier: 'T2', eng: ['long'], yrs: 7, rate: { category_key: 'caregiver', amount: 18000, unit: 'month' }, reply: 'within_day', liveIn: true, en: 'Elder care, gentle and patient.' },
  { name: 'พี่จอย Joy', cats: ['petcare', 'housekeeper'], zones: ['nimman', 'santitham'], langs: ['th', 'en'], tier: 'T0', eng: ['task', 'short'], yrs: 2, rate: { category_key: 'petcare', amount: 300, unit: 'visit' }, reply: 'within_hour' },
]

export async function seed(dbPath = DB_PATH) {
  mkdirSync(dirname(dbPath), { recursive: true })
  const raw = new DatabaseSync(dbPath)
  raw.exec('PRAGMA foreign_keys=OFF')
  // fresh: drop everything so re-seeding is clean
  for (const r of raw.prepare("SELECT name FROM sqlite_master WHERE type='table'").all())
    raw.exec(`DROP TABLE IF EXISTS ${r.name}`)
  migrateNode(raw)
  const db = nodeDb(raw)

  const config = JSON.parse(readFileSync(join(ROOT, 'tenants', 'chiangmai.json'), 'utf8'))
  config.cityName = { th: 'เชียงใหม่', en: 'Chiang Mai' }
  // Local dev: this operator answers on localhost. Production uses the real
  // hostname in tenants/chiangmai.json.
  await db.run('INSERT INTO operator(id, hostname, brand_name, config_json) VALUES (?,?,?,?)',
    'chiangmai', 'localhost', config.brandName, JSON.stringify(config))
  await syncTaxonomy(db, 'chiangmai', config)

  let n = 0
  for (const d of DEMO) {
    const uid = randomUUID()
    await db.run(
      `INSERT INTO app_user(id, operator_id, phone, phone_verified, display_name, is_worker, claimed, claim_phone)
       VALUES (?,?,?,?,?,1,?,?)`,
      uid, 'chiangmai', d.assisted ? null : `+66${800000000 + n}`, d.assisted ? 0 : 1,
      d.name, d.assisted ? 0 : 1, d.assisted ? `+66${810000000 + n}` : null)
    const id = await createWorker(db, 'chiangmai', config, {
      userId: uid, categories: d.cats, headline: d.cats[0], zones: d.zones,
      languages: d.langs, engagements: d.eng, years_experience: d.yrs,
      live_in_possible: !!d.liveIn, about_th: d.th ?? '', about_en: d.en ?? '',
      verification_tier: d.tier, certificate_note: d.cert ?? null,
      rates: d.rate ? [d.rate] : [],
    })
    if (d.reply) await db.run('UPDATE worker_profile SET reply_bucket=? WHERE id=?', d.reply, id)
    n++
  }
  raw.close()
  return { dbPath, workers: n }
}

// run directly (path-encoding-safe: compare decoded fs paths, not raw URLs —
// the project path contains spaces which would break a string URL compare)
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const r = await seed()
  console.log(`seeded ${r.workers} workers → ${r.dbPath}`)
}
