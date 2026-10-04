// The free tools: minimum-pay arithmetic (MR15), the /wage page and the
// printable /agreement, in both locales, JS off.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'
import { createApp } from '../src/app.mjs'
import { syncTaxonomy } from '../src/lib/taxonomy.mjs'
import { readInputs, minimumPay, RATES } from '../src/lib/wage.mjs'
import { clauses } from '../src/lib/agreement.mjs'
import { freshDb, makeOperator } from './helpers.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const HOST = 'motdang.test'
const ENV = { BASE_PATH: '/home-help', SESSION_SECRET: 's' }

async function app() {
  const db = freshDb()
  const config = JSON.parse(readFileSync(join(ROOT, 'tenants', 'motdang.json'), 'utf8'))
  await makeOperator(db, 'motdang', { hostname: HOST, config })
  await syncTaxonomy(db, 'motdang', config)
  return createApp(() => db)
}
const get = async (a, path) => {
  const res = await a.fetch(new Request(`https://${HOST}${path}`, { headers: { host: HOST } }), ENV)
  return { status: res.status, doc: new JSDOM(await res.text()).window.document }
}
const rate = (k) => RATES.areas.find((a) => a.key === k).thb

test('daily pay: each day worked earns the full daily minimum, however few hours', () => {
  const full = minimumPay(readInputs({ area: 'cm-mueang', basis: 'day', days: '5', hours: '8' }))
  assert.equal(full.perUnit, rate('cm-mueang'))
  assert.equal(full.perWeek, rate('cm-mueang') * 5)
  assert.equal(full.perMonth, Math.ceil(rate('cm-mueang') * 5 * 52 / 12))
  const short = minimumPay(readInputs({ area: 'cm-mueang', basis: 'day', days: '1', hours: '4' }))
  assert.equal(short.perUnit, rate('cm-mueang'))
  assert.equal(short.shortDay, true)
})

test('monthly pay floor is the daily minimum × 30', () => {
  const m = minimumPay(readInputs({ area: 'cm-other', basis: 'month', days: '6', hours: '8' }))
  assert.equal(m.perUnit, rate('cm-other') * 30)
  assert.equal(m.perWeek, null)
})

test('hours past 8 are overtime; an hourly basis falls back to daily', () => {
  const h = minimumPay(readInputs({ area: 'cr', basis: 'hour', days: '2', hours: '10' }))
  assert.equal(h.unit, 'day')
  assert.equal(h.hourly, 44)
  assert.equal(h.otHours, 2)
  assert.equal(h.normalHours, 8)
})

test('an offered wage reports the gap either way', () => {
  const low = minimumPay(readInputs({ area: 'cm-mueang', basis: 'month', pay: '5000' }))
  assert.equal(low.gap, 5000 - rate('cm-mueang') * 30)
  const ok = minimumPay(readInputs({ area: 'cm-mueang', basis: 'day', pay: '500' }))
  assert.equal(ok.gap, 500 - rate('cm-mueang'))
})

test('inputs are clamped; unknown area falls back to the first', () => {
  const i = readInputs({ area: 'mars', basis: 'week', days: '99', hours: '-3', pay: 'x' })
  assert.equal(i.area, RATES.areas[0].key)
  assert.equal(i.basis, 'day')
  assert.equal(i.days, 7)
  assert.equal(i.hours, 1)
  assert.equal(i.pay, null)
  assert.equal(minimumPay(i).restDayShort, true)
})

test('agreement uses employment wording (นายจ้าง / ลูกจ้าง), not hire-of-work', () => {
  const inp = readInputs({ basis: 'month', pay: '12000' })
  const all = clauses({ ...inp, min: minimumPay(inp) }).map((c) => c.th).join(' ')
  assert.match(all, /นายจ้าง/)
  assert.match(all, /ลูกจ้าง/)
  assert.doesNotMatch(all, /ผู้ว่าจ้าง|ผู้รับจ้าง/)
  assert.match(all, /12,000/)
})

for (const lang of ['th', 'en']) {
  test(`/wage renders the result and the agreement link (${lang})`, async () => {
    const { status, doc } = await get(await app(), `/wage?lang=${lang}&area=cm-mueang&basis=month&pay=9000`)
    assert.equal(status, 200)
    const big = doc.querySelector('.result .big').textContent
    assert.match(big, new RegExp((rate('cm-mueang') * 30).toLocaleString('en-US')))
    const link = doc.querySelector('a[href^="/home-help/agreement?"]')
    assert.ok(link, 'agreement link carries the numbers')
    assert.match(link.getAttribute('href'), /pay=9000/)
    assert.doesNotMatch(doc.body.textContent, /wage\.[a-z]/, 'no raw i18n key')
  })

  test(`/agreement renders 16 clauses, Thai beside English (${lang})`, async () => {
    const { status, doc } = await get(await app(), `/agreement?lang=${lang}&basis=day&pay=400&days=5&hours=8`)
    assert.equal(status, 200)
    assert.equal(doc.querySelectorAll('table.agr tr').length, 16)
    assert.ok(doc.querySelector('td[lang="th"]') && doc.querySelector('td[lang="en"]'))
    assert.match(doc.body.textContent, /400 บาท ต่อวัน/)
    assert.equal(doc.querySelector('meta[name="robots"]').getAttribute('content'), 'noindex')
  })
}

test('businesses strand: a shop row with stated facts shows its price, words, page and date', async () => {
  const db = freshDb()
  const config = JSON.parse(readFileSync(join(ROOT, 'tenants', 'motdang.json'), 'utf8'))
  await makeOperator(db, 'motdang', { hostname: HOST, config })
  await syncTaxonomy(db, 'motdang', config)
  const facts = [
    { field: 'price', thb: 350, unit: 'hour', quote: 'ชั่วโมงละ 350 บาท', url: 'https://clean.example/price', date: '2026-10-04' },
    { field: 'zones', quote: 'ทั่วเมืองเชียงใหม่', url: 'https://clean.example/price', date: '2026-10-04' },
  ]
  await db.run(`INSERT INTO shop(id, operator_id, category, name_th, url, province, source, facts)
    VALUES ('web-x','motdang','housekeeper','คลีนเอ็กซ์','https://clean.example/','cm','web',?)`, JSON.stringify(facts))
  await db.run(`INSERT INTO shop(id, operator_id, category, name_th, url, province)
    VALUES ('md-y','motdang','housekeeper','ร้านไม่บอกราคา','https://motdang.net/cm/p/y.html','cm')`)
  const a = createApp(() => db)
  const { doc } = await get(a, '/?category=housekeeper&zone=nimman')
  const rows = doc.querySelectorAll('.bizlist li')
  assert.equal(rows.length, 1)
  assert.match(rows[0].textContent, /350 ฿ \/ ชั่วโมง/)
  assert.match(rows[0].textContent, /ทั่วเมืองเชียงใหม่/)
  assert.match(rows[0].textContent, /clean\.example/)
  assert.match(rows[0].textContent, /2026-10-04/)
  const cr = await get(a, '/?category=housekeeper&zone=chiang-rai')
  assert.equal(cr.doc.querySelectorAll('.bizlist li').length, 0, 'a CM business stays off the Chiang Rai view')
})
