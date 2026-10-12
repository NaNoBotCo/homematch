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

// ---- the slip check (SlipOK), with the service stubbed ----
const SLIP_ENV = { PROMPTPAY_ID: '0812345678', SLIPOK_KEY: 'k', SLIPOK_BRANCH: '1' }
function stubSlipOk(reply) {
  const real = globalThis.fetch
  globalThis.fetch = async (url) => {
    if (String(url).startsWith('https://api.slipok.com/')) return new Response(JSON.stringify(reply()), { status: 200 })
    return real(url)
  }
  return () => { globalThis.fetch = real }
}
const post = async (a, path, form, env, cookie = '') => a.fetch(new Request(`https://${HOST}${path}`, {
  method: 'POST', body: form, headers: { host: HOST, origin: `https://${HOST}`, ...(cookie ? { cookie } : {}) },
}), { BASE_PATH: '/home-help', SESSION_SECRET: 's', ...env })
const slipForm = (extra = {}) => {
  const f = new FormData()
  f.append('for', 'agreement'); f.append('back', '/home-help/agreement?lang=en')
  f.append('slip', new File([new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3])], 'slip.jpg', { type: 'image/jpeg' }))
  for (const [k, v] of Object.entries(extra)) f.set(k, v)
  return f
}

test('with the slip check on, the agreement stays shut until its ฿100 is confirmed, then opens', async () => {
  const a = await app()
  const shut = await get(a, '/agreement?lang=en', SLIP_ENV)
  assert.equal(shut.doc.querySelector('table.agr'), null, 'no agreement before paying')
  assert.ok(shut.doc.querySelector('.paybox input[type=file][name=slip]'))
  let n = 0
  const restore = stubSlipOk(() => ({ success: true, data: { success: true, transRef: 'T-' + (++n), amount: 100 } }))
  try {
    const res = await post(a, '/pay/verify', slipForm(), SLIP_ENV)
    assert.equal(res.status, 303)
    assert.equal(res.headers.get('location'), '/home-help/agreement?lang=en')
    const cookie = res.headers.get('set-cookie').split(';')[0]
    assert.match(cookie, /^paid_agreement=/)
    const r2 = await a.fetch(new Request(`https://${HOST}/agreement?lang=en`, { headers: { host: HOST, cookie } }),
      { BASE_PATH: '/home-help', SESSION_SECRET: 's', ...SLIP_ENV })
    const doc = new JSDOM(await r2.text()).window.document
    assert.ok(doc.querySelector('table.agr'), 'the agreement opens')
    assert.equal(doc.querySelector('.paybox'), null)
  } finally { restore() }
})

test('a slip SlipOK refuses, or one already used here, sends the payer back with the reason', async () => {
  const a = await app()
  let restore = stubSlipOk(() => ({ success: false, code: 1013, message: 'amount' }))
  try {
    const res = await post(a, '/pay/verify', slipForm(), SLIP_ENV)
    assert.equal(res.headers.get('location'), '/home-help/agreement?lang=en&err=amount')
    const back = await get(a, '/agreement?lang=en&err=amount', SLIP_ENV)
    assert.match(back.doc.querySelector('.paybox .err').textContent, /different amount/)
  } finally { restore() }
  restore = stubSlipOk(() => ({ success: true, data: { success: true, transRef: 'SAME', amount: 100 } }))
  try {
    await post(a, '/pay/verify', slipForm(), SLIP_ENV)
    const again = await post(a, '/pay/verify', slipForm(), SLIP_ENV)
    assert.match(again.headers.get('location'), /err=used$/)
  } finally { restore() }
})

test('a referral slip pays 15% of the booking and shows the paid page', async () => {
  const a = await app()
  const restore = stubSlipOk(() => ({ success: true, data: { success: true, transRef: 'R1', amount: 150 } }))
  try {
    const f = slipForm({ for: 'referral', amount: '1000', back: '' })
    const res = await post(a, '/pay/verify', f, SLIP_ENV)
    assert.equal(res.status, 200)
    assert.match(await res.text(), /150/)
  } finally { restore() }
})
