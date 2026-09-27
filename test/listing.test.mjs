// Self-listing on the motdang tenant: join → pending → approve → public
// contact; the private edit link; removal; moderation auth; the base-path
// mount; and the guards (consent, honeypot, cross-site POST, daily cap).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'
import { createApp } from '../src/app.mjs'
import { stripBase } from '../src/worker.mjs'
import { syncTaxonomy } from '../src/lib/taxonomy.mjs'
import { assertConfigValid } from '../src/lib/tenant.mjs'
import { cleanPhone, cleanLineId, lineHref, formatPhone } from '../src/lib/listing.mjs'
import { freshDb, makeOperator } from './helpers.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const mdConfig = () => JSON.parse(readFileSync(join(ROOT, 'tenants', 'motdang.json'), 'utf8'))
const HOST = 'motdang.test'
const BASE = '/home-help'
const ENV = { BASE_PATH: BASE, ADMIN_KEY: 'k-admin-test', SESSION_SECRET: 's' }

async function setup() {
  const db = freshDb()
  const config = mdConfig()
  await makeOperator(db, 'motdang', { hostname: HOST, config })
  await syncTaxonomy(db, 'motdang', config)
  return { db, app: createApp(() => db) }
}

const req = (app, path, { method = 'GET', form, headers = {}, env = ENV } = {}) => {
  const h = { host: HOST, ...headers }
  let body
  if (form) {
    const p = new URLSearchParams()
    for (const [k, v] of Object.entries(form)) for (const x of [].concat(v)) p.append(k, x)
    body = p.toString()
    h['content-type'] = 'application/x-www-form-urlencoded'
    if (!('origin' in h)) h.origin = `https://${HOST}`
  }
  return app.fetch(new Request(`https://${HOST}${path}`, { method, headers: h, body }), env)
}
const text = async (res) => ({ status: res.status, html: await res.text(), res })
const doc = (html) => new JSDOM(html).window.document
const basic = (pw) => ({ authorization: 'Basic ' + btoa('nan:' + pw) })

const GOOD = {
  display_name: 'พี่นก',
  categories: ['housekeeper', 'laundry'],
  zones: ['old-city', 'santitham'],
  languages: ['th', 'shan'],
  engagements: ['long'],
  rate_amount: '500',
  rate_unit: 'day',
  contact_line: 'noknok.cm',
  contact_phone: '081-234-5678',
  about_th: 'ทำความสะอาดบ้าน ซักรีด',
  consent: 'on',
}

async function joinGood(app, over = {}) {
  const { status, html } = await text(await req(app, '/join', { method: 'POST', form: { ...GOOD, ...over } }))
  assert.equal(status, 200, html)
  const link = doc(html).querySelector('a.secret')
  assert.ok(link, 'private link shown')
  const token = link.getAttribute('href').split('/edit/')[1]
  return { token, html }
}

test('motdang tenant config is valid and passes AAA contrast', () => {
  assertConfigValid(mdConfig())
})

test('join creates a PENDING listing: not in the directory, profile 404', async () => {
  const { db, app } = await setup()
  const { token, html } = await joinGood(app)
  assert.ok(html.includes(`https://${HOST}${BASE}/edit/${token}`), 'absolute edit link under the base')
  const dir = await text(await req(app, '/'))
  assert.equal(dir.html.includes('พี่นก'), false)
  const row = await db.get("SELECT id, status, active, edit_hash FROM worker_profile WHERE operator_id='motdang'")
  assert.equal(row.status, 'pending')
  assert.equal(row.active, 0)
  assert.notEqual(row.edit_hash, token, 'only the hash is stored')
  assert.equal((await req(app, `/w/${row.id}`)).status, 404)
})

test('approve → listed; profile shows LINE + call buttons, noindex by default', async () => {
  const { db, app } = await setup()
  await joinGood(app)
  const { id } = await db.get('SELECT id FROM worker_profile')
  const r = await req(app, `/admin/${id}/approve`, { method: 'POST', form: {}, headers: basic(ENV.ADMIN_KEY) })
  assert.equal(r.status, 303)
  assert.equal(r.headers.get('location'), `${BASE}/admin`)
  const dir = await text(await req(app, '/'))
  const d = doc(dir.html)
  const card = d.querySelector(`.wcard h3 a[href="${BASE}/w/${id}"]`)
  assert.ok(card, 'card links under the base')
  assert.equal(d.querySelector('.tier'), null, 'no tier badge on this tenant')
  const prof = await text(await req(app, `/w/${id}`))
  const p = doc(prof.html)
  assert.ok(p.querySelector('a[href="https://line.me/ti/p/~noknok.cm"]'), 'LINE button')
  assert.ok(p.querySelector('a[href="tel:0812345678"]'), 'call button')
  assert.ok(prof.html.includes('081-234-5678'), 'phone printed in Thai format')
  assert.equal(p.querySelector('meta[name="robots"]').getAttribute('content'), 'noindex')
})

test('indexable opt-in drops the noindex', async () => {
  const { db, app } = await setup()
  await joinGood(app, { indexable: 'on' })
  const { id } = await db.get('SELECT id FROM worker_profile')
  await req(app, `/admin/${id}/approve`, { method: 'POST', form: {}, headers: basic(ENV.ADMIN_KEY) })
  const p = doc((await text(await req(app, `/w/${id}`))).html)
  assert.equal(p.querySelector('meta[name="robots"]'), null)
})

test('edit link: opens, saves, re-reviews on contact change, removes', async () => {
  const { db, app } = await setup()
  const { token } = await joinGood(app)
  const { id } = await db.get('SELECT id FROM worker_profile')
  await req(app, `/admin/${id}/approve`, { method: 'POST', form: {}, headers: basic(ENV.ADMIN_KEY) })

  const page = await text(await req(app, `/edit/${token}`))
  assert.equal(page.status, 200)
  assert.equal(doc(page.html).querySelector('#f-line').value, 'noknok.cm')
  assert.equal(page.res.headers.get('referrer-policy'), 'no-referrer')

  // about change only: stays live
  let r = await req(app, `/edit/${token}`, { method: 'POST', form: { ...GOOD, about_th: 'ใหม่' } })
  assert.equal(r.status, 303)
  assert.equal((await db.get('SELECT status FROM worker_profile')).status, 'live')
  // contact change: back to pending
  r = await req(app, `/edit/${token}`, { method: 'POST', form: { ...GOOD, contact_phone: '0899999999' } })
  assert.equal(r.headers.get('location'), `${BASE}/edit/${token}?saved=review`)
  assert.equal((await db.get('SELECT status FROM worker_profile')).status, 'pending')

  assert.equal((await req(app, '/edit/not-a-real-token-at-all-xx')).status, 404)

  r = await text(await req(app, `/edit/${token}/remove`, { method: 'POST', form: {} }))
  assert.equal(r.status, 200)
  assert.equal((await db.get('SELECT COUNT(*) n FROM worker_profile')).n, 0)
  assert.equal((await db.get("SELECT COUNT(*) n FROM app_user WHERE operator_id='motdang'")).n, 0)
  assert.equal((await db.get('SELECT COUNT(*) n FROM worker_category')).n, 0)
})

test('admin needs the key; no key configured = no admin', async () => {
  const { app } = await setup()
  assert.equal((await req(app, '/admin')).status, 401)
  assert.equal((await req(app, '/admin', { headers: basic('wrong') })).status, 401)
  assert.equal((await req(app, '/admin', { headers: basic(ENV.ADMIN_KEY) })).status, 200)
  assert.equal((await req(app, '/admin', { headers: basic(ENV.ADMIN_KEY), env: { BASE_PATH: BASE } })).status, 404)
})

test('guards: consent, contact, honeypot, cross-site POST, daily cap', async () => {
  const { db, app } = await setup()
  let r = await text(await req(app, '/join', { method: 'POST', form: { ...GOOD, consent: undefined } }))
  assert.equal(r.status, 400)
  assert.ok(doc(r.html).querySelector('.errors a[href="#f-consent"]'))
  r = await text(await req(app, '/join', { method: 'POST', form: { ...GOOD, contact_line: '', contact_phone: '' } }))
  assert.equal(r.status, 400)
  assert.equal(doc(r.html).querySelector('#f-name').value, 'พี่นก', 'form keeps what was typed')
  r = await text(await req(app, '/join', { method: 'POST', form: { ...GOOD, website: 'http://spam' } }))
  assert.equal(r.status, 200)
  assert.equal((await db.get('SELECT COUNT(*) n FROM worker_profile')).n, 0, 'honeypot makes no row')
  r = await req(app, '/join', { method: 'POST', form: GOOD, headers: { origin: 'https://evil.example' } })
  assert.equal(r.status, 403)
  for (let i = 0; i < 5; i++) await joinGood(app)
  r = await text(await req(app, '/join', { method: 'POST', form: GOOD }))
  assert.equal(r.status, 400)
  assert.equal((await db.get('SELECT COUNT(*) n FROM worker_profile')).n, 5)
})

test('pages print links under the base; no i18n key leaks (both locales)', async () => {
  const { db, app } = await setup()
  await joinGood(app)
  const { id } = await db.get('SELECT id FROM worker_profile')
  await req(app, `/admin/${id}/approve`, { method: 'POST', form: {}, headers: basic(ENV.ADMIN_KEY) })
  for (const lang of ['th', 'en']) {
    for (const path of ['/', '/join', '/how', `/w/${id}`]) {
      const { status, html } = await text(await req(app, `${path}?lang=${lang}`))
      assert.equal(status, 200, path)
      const d = doc(html)
      for (const a of d.querySelectorAll('a[href^="/"], form[action^="/"]')) {
        const href = a.getAttribute('href') || a.getAttribute('action')
        assert.ok(href.startsWith(BASE + '/') || href === BASE, `${path}: ${href} escapes the base`)
      }
      const leak = d.body.textContent.match(/\b(dir|cat|zone|tier|nav|profile|engagement|reply|lang|common|action|page|legal|join|err|done|edit|admin|unit)\.[a-z][\w.]*/i)
      assert.equal(leak, null, `${path} [${lang}] leaked ${leak?.[0]}`)
      assert.equal(d.documentElement.getAttribute('lang'), lang)
    }
  }
})

test('join form: every input has a label; no nested interactives', async () => {
  const { app } = await setup()
  const d = doc((await text(await req(app, '/join'))).html)
  for (const el of d.querySelectorAll('form.listing input:not([type=hidden]), form.listing select, form.listing textarea')) {
    if (el.closest('.hp')) continue
    const labelled = el.closest('label') || (el.id && d.querySelector(`label[for="${el.id}"]`))
    assert.ok(labelled, `unlabelled ${el.name}`)
  }
  assert.equal(d.querySelectorAll('a a, a button, button a, label label').length, 0)
})

test('stripBase mounts the app under a path', () => {
  assert.equal(stripBase('/home-help', BASE), '/')
  assert.equal(stripBase('/home-help/', BASE), '/')
  assert.equal(stripBase('/home-help/w/abc', BASE), '/w/abc')
  assert.equal(stripBase('/home-helpers', BASE), null)
  assert.equal(stripBase('/x', ''), '/x')
})

test('phone and LINE cleaning', () => {
  assert.equal(cleanPhone('081-234-5678'), '0812345678')
  assert.equal(cleanPhone('+66 81 234 5678'), '+66812345678')
  assert.equal(cleanPhone('1234'), null)
  assert.equal(cleanPhone(''), '')
  assert.equal(formatPhone('0812345678'), '081-234-5678')
  assert.equal(formatPhone('053123456'), '05-312-3456')
  assert.equal(cleanLineId('LINE ID: nok_2024'), 'nok_2024')
  assert.equal(cleanLineId('@motdang'), '@motdang')
  assert.equal(cleanLineId('ไลน์นก'), null)
  assert.equal(lineHref('@motdang'), 'https://line.me/R/ti/p/%40motdang')
  assert.equal(lineHref('nok'), 'https://line.me/ti/p/~nok')
})
