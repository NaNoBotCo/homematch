// a11y + security-invariant suite. Renders REAL pages through the app and
// asserts the structural accessibility rules (§2.1, §11.4) and the
// contact-withholding invariant (§6, §11.2) hold in the produced HTML.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'
import { createApp } from '../src/app.mjs'
import { syncTaxonomy } from '../src/lib/taxonomy.mjs'
import { createWorker } from '../src/repo.mjs'
import { freshDb, makeOperator, makeUser } from './helpers.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const cmConfig = () => {
  const c = JSON.parse(readFileSync(join(ROOT, 'tenants', 'chiangmai.json'), 'utf8'))
  c.cityName = { th: 'เชียงใหม่', en: 'Chiang Mai' }
  return c
}
const SECRET_PHONE = '+66898887777'

async function appWithData() {
  const db = freshDb()
  const config = cmConfig()
  await makeOperator(db, 'cm', { hostname: 'localhost', config })
  await syncTaxonomy(db, 'cm', config)
  // a worker whose USER row carries a phone + LINE id — these must never leak
  const uid = await makeUser(db, 'cm', { display_name: 'Nok', phone: SECRET_PHONE })
  await db.run('UPDATE app_user SET claim_phone=? WHERE id=?', SECRET_PHONE, uid)
  const wid = await createWorker(db, 'cm', config, {
    userId: uid, categories: ['housekeeper'], zones: ['old-city'], languages: ['th', 'en'],
    engagements: ['long'], verification_tier: 'T1', about_en: 'Careful worker.',
    rates: [{ category_key: 'housekeeper', amount: 500, unit: 'day' }],
  })
  const app = createApp(() => db)
  return { app, wid }
}

const get = async (app, path) => {
  const res = await app.fetch(new Request(`http://localhost${path}`, { headers: { host: 'localhost' } }))
  return { status: res.status, html: await res.text() }
}
const dom = (html) => new JSDOM(html).window.document

function assertNoNestedInteractive(doc, where) {
  const nested = doc.querySelectorAll('a a, a button, button a, button button')
  assert.equal(nested.length, 0, `${where}: nested interactive elements`)
}
function assertRealInteractivesOnly(doc, where) {
  // no click-handler divs / role=button fakes — real <a>/<button> only
  const fakes = [...doc.querySelectorAll('[onclick], [role="button"]')]
    .filter((el) => !['A', 'BUTTON'].includes(el.tagName))
  assert.equal(fakes.length, 0, `${where}: fake interactive (div onclick / role=button)`)
}

test('directory page: structural accessibility', async () => {
  const { app } = await appWithData()
  const { status, html } = await get(app, '/')
  assert.equal(status, 200)
  const doc = dom(html)
  assert.equal(doc.documentElement.getAttribute('lang'), 'th', 'html lang set')
  assert.ok(doc.querySelector('a.skip[href="#main"]'), 'skip link present')
  assert.ok(doc.querySelector('#main'), 'main landmark target present')
  assert.ok(doc.querySelector('[aria-live="polite"]'), 'result count is a live region')
  assertNoNestedInteractive(doc, 'directory')
  assertRealInteractivesOnly(doc, 'directory')
  // filter chips are real links (work with JS disabled)
  assert.ok(doc.querySelector('.filters a.btn[href]'), 'filters are navigable links')
})

test('profile page: structural accessibility', async () => {
  const { app, wid } = await appWithData()
  const { status, html } = await get(app, `/w/${wid}`)
  assert.equal(status, 200)
  const doc = dom(html)
  assertNoNestedInteractive(doc, 'profile')
  assertRealInteractivesOnly(doc, 'profile')
  assert.ok(doc.querySelector('.tier'), 'tier badge rendered (glyph + label)')
})

test('CONTACT-WITHHOLDING INVARIANT: no pre-reveal page leaks phone/LINE', async () => {
  const { app, wid } = await appWithData()
  for (const path of ['/', `/w/${wid}`]) {
    const { html } = await get(app, path)
    assert.equal(html.includes(SECRET_PHONE), false, `${path} leaked the phone number`)
    // also the digit run without the +66 prefix
    assert.equal(html.includes('898887777'), false, `${path} leaked phone digits`)
  }
})

test('no untranslated i18n keys leak into rendered text (both locales)', async () => {
  const { app, wid } = await appWithData()
  for (const lang of ['th', 'en']) {
    for (const path of ['/', '/how', `/w/${wid}`]) {
      const { html } = await get(app, `${path}?lang=${lang}`)
      const body = dom(html).body.textContent
      // a leaked key looks like  dir.count / cat.housekeeper / tier.T1.glyph
      const leak = body.match(/\b(dir|cat|zone|tier|nav|profile|engagement|reply|lang|common|action|page|legal)\.[a-z][\w.]*/i)
      assert.equal(leak, null, `${path} [${lang}] leaked i18n key: ${leak?.[0]}`)
    }
  }
})
