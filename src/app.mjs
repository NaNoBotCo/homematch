// app.mjs — the Hono application, portable across the Worker runtime (D1) and
// the local node dev server (node:sqlite). It receives a db-adapter factory so
// the same routes run in both. Server-rendered HTML; no SPA (§3).
//
// Mounted under a path (motdang.net/home-help) the Worker strips the prefix
// before the request reaches these routes and passes it as env.BASE_PATH;
// every link the pages print starts with ctx.base.
import { Hono } from 'hono'
import { createHash, timingSafeEqual } from 'node:crypto'
import { resolveTenant } from './lib/tenant.mjs'
import { makeT, registerOverride } from './i18n/index.mjs'
import {
  listWorkers, getWorker, createListing, findByEditToken, updateListing, removeListing,
  setListingStatus, listByStatus, countAttempt, sha256,
} from './repo.mjs'
import { page } from './pages/layout.mjs'
import { directoryBody } from './pages/directory.mjs'
import { profileBody } from './pages/profile.mjs'
import { joinBody, doneBody, editBody, removedBody, adminBody } from './pages/listing.mjs'
import { readListingForm, valuesFromWorker } from './lib/listing.mjs'
import { html } from './lib/html.mjs'

const DAILY_SENDS = 5 // join-form sends per connection per 24 h

/** Build the app. `getDb(env)` returns a db adapter for the request. */
export function createApp(getDb) {
  const app = new Hono()

  // tenant + locale + db context on every request
  app.use('*', async (c, next) => {
    const db = getDb(c.env)
    const host = c.req.header('host') || new URL(c.req.url).host
    const tenant = await resolveTenant(db, host)
    if (!tenant) return c.text('Unknown tenant for host ' + host, 404)
    const url = new URL(c.req.url)
    const query = Object.fromEntries(url.searchParams)
    const config = tenant.config
    const operatorId = tenant.operator.id
    if (config.strings && !registered.has(operatorId)) {
      for (const [loc, pack] of Object.entries(config.strings)) registerOverride(operatorId, loc, pack)
      registered.add(operatorId)
    }
    const locale = pickLocale(query.lang, c.req.header('cookie'), config)
    const base = (c.env && c.env.BASE_PATH) || ''
    c.set('ctx', {
      db, config, operatorId,
      locale, t: makeT(locale, operatorId),
      path: url.pathname, query, base, origin: url.origin,
    })
    await next()
    c.header('X-Content-Type-Options', 'nosniff')
    if (query.lang && (config.locales || []).includes(query.lang))
      c.header('Set-Cookie', `lang=${query.lang}; Path=${base || '/'}; Max-Age=31536000; SameSite=Lax; Secure`, { append: true })
  })

  // A form POST must come from this site. Browsers send Origin on form posts;
  // a cross-site one is refused before any handler runs.
  app.use('*', async (c, next) => {
    if (c.req.method === 'POST') {
      const src = c.req.header('origin') || c.req.header('referer')
      if (src) {
        let host = ''
        try { host = new URL(src).host } catch {}
        if (host !== (c.req.header('host') || new URL(c.req.url).host)) return c.text('Forbidden', 403)
      }
    }
    await next()
  })

  const render = (c, opts, status = 200) =>
    c.html(page(c.get('ctx'), opts).toString(), status)

  app.get('/', async (c) => {
    const ctx = c.get('ctx')
    const filters = {
      category: ctx.query.category, zone: ctx.query.zone, language: ctx.query.language,
      engagement: ctx.query.engagement, tier: ctx.query.tier, sort: ctx.query.sort,
    }
    const workers = await listWorkers(ctx.db, ctx.operatorId, filters)
    const filtered = Object.values(filters).some(Boolean)
    return render(c, {
      title: ctx.t('dir.title', { city: '' }).trim(), body: directoryBody(ctx, workers),
      canonical: filtered ? null : '/', description: ctx.config.selfListing ? ctx.t('dir.lede') : null,
    })
  })

  app.get('/w/:id', async (c) => {
    const ctx = c.get('ctx')
    const w = await getWorker(ctx.db, ctx.operatorId, c.req.param('id'))
    if (!w || !w.active) return render(c, { title: '404', body: html`<h1>404</h1>`, robots: 'noindex' }, 404)
    const cats = w.categories.map((k) => ctx.t('cat.' + k)).join(', ')
    const zones = w.zones.map((k) => ctx.t('zone.' + k)).join(', ')
    return render(c, {
      title: w.display_name, body: profileBody(ctx, w), canonical: `/w/${w.id}`,
      description: `${cats} · ${zones}`,
      robots: ctx.config.selfListing && !w.indexable ? 'noindex' : null,
    })
  })

  app.get('/how', async (c) => {
    const ctx = c.get('ctx')
    const body = html`<h1>${ctx.t('page.how.title')}</h1><p>${ctx.t('page.how.body')}</p>
      <p class="muted">${ctx.t('legal.notEmployer')}</p>`
    return render(c, { title: ctx.t('page.how.title'), body, canonical: '/how' })
  })

  app.get('/about', async (c) => {
    const ctx = c.get('ctx')
    const body = html`<h1>${ctx.t('page.about.title')}</h1><p>${ctx.t('page.how.body')}</p>`
    return render(c, { title: ctx.t('page.about.title'), body })
  })

  app.get('/privacy', async (c) => {
    const ctx = c.get('ctx')
    const body = html`<h1>${ctx.t('page.privacy.title')}</h1><p>${ctx.t('legal.notEmployer')}</p>`
    return render(c, { title: ctx.t('page.privacy.title'), body })
  })

  // ── self-listing ──────────────────────────────────────────────────────────
  const selfListing = async (c, next) => {
    if (!c.get('ctx').config.selfListing) return c.notFound()
    await next()
  }

  app.get('/join', selfListing, async (c) => {
    const ctx = c.get('ctx')
    return render(c, {
      title: ctx.t('join.title'), canonical: '/join', description: ctx.t('join.intro'),
      body: joinBody(ctx, { values: { consent: false }, action: `${ctx.base}/join` }),
    })
  })

  app.post('/join', selfListing, async (c) => {
    const ctx = c.get('ctx')
    const body = await c.req.parseBody({ all: true })
    const { values, errors } = readListingForm(ctx.config, body)
    // the hidden 'website' field is empty for people; a filled one is a bot,
    // which gets the same page a person gets and no row
    if (String(body.website || '').trim()) return render(c, { title: ctx.t('done.title'), body: doneBody(ctx, ctx.origin + ctx.base + '/'), robots: 'noindex' })
    if (!errors.length) {
      const n = await countAttempt(ctx.db, ctx.operatorId, ipHash(c))
      if (n > DAILY_SENDS) errors.push('err.limit')
    }
    if (errors.length)
      return render(c, {
        title: ctx.t('join.title'), robots: 'noindex',
        body: joinBody(ctx, { values, errors, action: `${ctx.base}/join` }),
      }, 400)
    const { id, token } = await createListing(ctx.db, ctx.operatorId, ctx.config, values)
    alert(c, ctx, id, values)
    c.header('Cache-Control', 'no-store')
    c.header('Referrer-Policy', 'no-referrer')
    return render(c, {
      title: ctx.t('done.title'), robots: 'noindex',
      body: doneBody(ctx, `${ctx.origin}${ctx.base}/edit/${token}`),
    })
  })

  app.get('/edit/:token', selfListing, async (c) => {
    const ctx = c.get('ctx')
    const token = c.req.param('token')
    const w = await findByEditToken(ctx.db, ctx.operatorId, token)
    if (!w) return render(c, { title: '404', body: html`<h1>404</h1>`, robots: 'noindex' }, 404)
    c.header('Cache-Control', 'no-store')
    c.header('Referrer-Policy', 'no-referrer')
    return render(c, {
      title: ctx.t('edit.title'), robots: 'noindex',
      body: editBody(ctx, w, { values: valuesFromWorker(w), token, saved: ctx.query.saved }),
    })
  })

  app.post('/edit/:token', selfListing, async (c) => {
    const ctx = c.get('ctx')
    const token = c.req.param('token')
    const w = await findByEditToken(ctx.db, ctx.operatorId, token)
    if (!w) return render(c, { title: '404', body: html`<h1>404</h1>`, robots: 'noindex' }, 404)
    const { values, errors } = readListingForm(ctx.config, await c.req.parseBody({ all: true }))
    c.header('Referrer-Policy', 'no-referrer')
    if (errors.length)
      return render(c, { title: ctx.t('edit.title'), robots: 'noindex', body: editBody(ctx, w, { values, errors, token }) }, 400)
    const { review } = await updateListing(ctx.db, ctx.operatorId, ctx.config, w.id, values)
    if (review) alert(c, ctx, w.id, values)
    return c.redirect(`${ctx.base}/edit/${token}?saved=${review ? 'review' : '1'}`, 303)
  })

  app.post('/edit/:token/remove', selfListing, async (c) => {
    const ctx = c.get('ctx')
    const w = await findByEditToken(ctx.db, ctx.operatorId, c.req.param('token'))
    if (w) await removeListing(ctx.db, ctx.operatorId, w.id)
    return render(c, { title: ctx.t('edit.removed'), robots: 'noindex', body: removedBody(ctx) })
  })

  // ── operator moderation ───────────────────────────────────────────────────
  // HTTP Basic, any user name, password = env.ADMIN_KEY. Unset key = no admin.
  const admin = async (c, next) => {
    const key = c.env && c.env.ADMIN_KEY
    if (!key || !c.get('ctx').config.selfListing) return c.notFound()
    const m = /^Basic\s+(.+)$/i.exec(c.req.header('authorization') || '')
    let pass = ''
    if (m) { try { pass = atob(m[1]).split(':').slice(1).join(':') } catch {} }
    if (!safeEqual(pass, key)) {
      c.header('WWW-Authenticate', 'Basic realm="listings", charset="UTF-8"')
      return c.text('Unauthorized', 401)
    }
    c.header('Cache-Control', 'no-store')
    await next()
  }

  app.get('/admin', admin, async (c) => {
    const ctx = c.get('ctx')
    const [pending, live, hidden] = await Promise.all(
      ['pending', 'live', 'hidden'].map((s) => listByStatus(ctx.db, ctx.operatorId, s)))
    return render(c, { title: ctx.t('admin.title'), robots: 'noindex', body: adminBody(ctx, { pending, live, hidden }) })
  })

  app.post('/admin/:id/:action', admin, async (c) => {
    const ctx = c.get('ctx')
    const id = c.req.param('id')
    const action = c.req.param('action')
    if (action === 'approve') await setListingStatus(ctx.db, ctx.operatorId, id, 'live')
    else if (action === 'hide') await setListingStatus(ctx.db, ctx.operatorId, id, 'hidden')
    else if (action === 'delete') await removeListing(ctx.db, ctx.operatorId, id)
    else return c.notFound()
    return c.redirect(`${ctx.base}/admin`, 303)
  })

  return app
}

const registered = new Set()

function pickLocale(langParam, cookie, config) {
  const allowed = config.locales || ['th', 'en']
  if (langParam && allowed.includes(langParam)) return langParam
  const m = /(?:^|;\s*)lang=([a-z-]+)/.exec(cookie || '')
  if (m && allowed.includes(m[1])) return m[1]
  return config.defaultLocale || allowed[0]
}

function safeEqual(a, b) {
  const ha = createHash('sha256').update(String(a)).digest()
  const hb = createHash('sha256').update(String(b)).digest()
  return timingSafeEqual(ha, hb)
}

function ipHash(c) {
  const ip = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'local'
  return sha256(((c.env && c.env.SESSION_SECRET) || 'dev') + '|' + ip.split(',')[0].trim())
}

/** Tell the operator a listing is waiting. Sends through Resend when
 *  RESEND_KEY, ALERT_TO and ALERT_FROM are set on the Worker; otherwise does
 *  nothing. Runs after the response. */
function alert(c, ctx, id, v) {
  const env = c.env || {}
  if (!env.RESEND_KEY || !env.ALERT_TO || !env.ALERT_FROM) return
  const t = makeT('th', ctx.operatorId)
  const lines = [
    `${v.display_name}`,
    v.categories.map((k) => t('cat.' + k)).join(', '),
    v.zones.map((k) => t('zone.' + k)).join(', '),
    v.contact_line ? `LINE ${v.contact_line}` : '',
    v.contact_phone ? `โทร ${v.contact_phone}` : '',
    v.about_th || '', v.about_en || '',
    '',
    `${ctx.origin}${ctx.base}/admin`,
  ].filter((x, i) => x !== '' || i === 7)
  const send = fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: env.ALERT_FROM, to: [env.ALERT_TO],
      subject: `${t('admin.pending')}: ${v.display_name} · ${ctx.config.brandName}`,
      text: lines.join('\n'),
    }),
  }).catch(() => {})
  try { c.executionCtx.waitUntil(send) } catch { /* node dev: fire and forget */ }
}
