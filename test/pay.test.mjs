// The PromptPay pages: prices from the tenant, a QR banks accept (CRC), the
// agreement's ฿100 box, and nothing offered when no payee is set.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'
import { createApp } from '../src/app.mjs'
import { syncTaxonomy } from '../src/lib/taxonomy.mjs'
import { priceOf } from '../src/lib/pay.mjs'
import { promptPayPayload, verifyPayload } from '../src/lib/promptpay.mjs'
import { freshDb, makeOperator } from './helpers.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const HOST = 'motdang.test'
const config = JSON.parse(readFileSync(join(ROOT, 'tenants', 'motdang.json'), 'utf8'))

async function app() {
  const db = freshDb()
  await makeOperator(db, 'motdang', { hostname: HOST, config })
  await syncTaxonomy(db, 'motdang', config)
  return createApp(() => db)
}
const get = async (a, path, env) => {
  const res = await a.fetch(new Request(`https://${HOST}${path}`, { headers: { host: HOST } }),
    { BASE_PATH: '/home-help', SESSION_SECRET: 's', ...env })
  return { status: res.status, doc: new JSDOM(await res.text()).window.document }
}

test('prices come from the tenant; a referral is its percent of the booking, whole baht', () => {
  assert.equal(priceOf(config, 'agreement'), 100)
  assert.equal(priceOf(config, 'subscription'), 1000)
  assert.equal(priceOf(config, 'pack'), 2000)
  assert.equal(priceOf(config, 'referral', 1350), 203)
  assert.equal(priceOf(config, 'referral', 'x'), null)
})

test('the payload carries the mobile payee and the exact amount, and its CRC checks', () => {
  const p = promptPayPayload({ payeeId: '0812345678', satang: 10000, oneTime: true, merchantName: 'Mot Dang', ref: 'MD-AGREEMENT' })
  assert.ok(verifyPayload(p))
  assert.match(p, /0066812345678/)
  assert.match(p, /5406100\.00/)
})

test('/pay shows the QR for the asked kind; no payee, no QR', async () => {
  const a = await app()
  const on = await get(a, '/pay?for=pack&lang=en', { PROMPTPAY_ID: '0812345678' })
  assert.equal(on.status, 200)
  assert.ok(on.doc.querySelector('.paybox svg'))
  assert.match(on.doc.querySelector('.paybox .amt').textContent, /฿2,000/)
  assert.equal(on.doc.querySelector('meta[name="robots"]').getAttribute('content'), 'noindex')
  const off = await get(a, '/pay?for=pack&lang=en', {})
  assert.equal(off.doc.querySelector('.paybox'), null)
})

test('the agreement page carries the ฿100 box above the agreement, kept off the print', async () => {
  const a = await app()
  const { doc } = await get(a, '/agreement?lang=en', { PROMPTPAY_ID: '0812345678' })
  const box = doc.querySelector('.paybox')
  assert.ok(box && box.classList.contains('noprint'))
  assert.match(box.textContent, /฿100/)
  assert.ok(box.compareDocumentPosition(doc.querySelector('table.agr')) & 4)
})
