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
  setListingStatus, listByStatus, countAttempt, sha256, logEvent, screenHistory,
  addPhoto, listPhotos, getPhoto, deletePhoto, setPhotoStatus, heldPhotos,
} from './repo.mjs'
import { screen } from './lib/screen.mjs'
import { clean, lookAt, MAX_PHOTOS } from './lib/photos.mjs'
import { runDigest } from './digest.mjs'
import { randomUUID } from 'node:crypto'
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
        if (host !== (c.req.header('host') || new URL(c.req.url).host)) {
          const ctx = c.get('ctx')
          await logEvent(ctx.db, ctx.operatorId, 'cross-site', { ipHash: ipHash(c), detail: { from: host.slice(0, 60), path: ctx.path } })
          return c.text('Forbidden', 403)
        }
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
    w.photos = await listPhotos(ctx.db, ctx.operatorId, w.id)
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
    const ip = ipHash(c)
    // the hidden 'website' field is empty for people; a filled one is a bot,
    // which gets the page a held listing gets and no row
    if (String(body.website || '').trim()) {
      await logEvent(ctx.db, ctx.operatorId, 'honeypot', { ipHash: ip })
      return render(c, { title: ctx.t('done.title'), body: doneBody(ctx, ctx.origin + ctx.base + '/'), robots: 'noindex' })
    }
    if (!errors.length) {
      const n = await countAttempt(ctx.db, ctx.operatorId, ip)
      if (n > DAILY_SENDS) {
        errors.push('err.limit')
        await logEvent(ctx.db, ctx.operatorId, 'rate-limit', { ipHash: ip, name: values.display_name })
      }
    }
    if (errors.length)
      return render(c, {
        title: ctx.t('join.title'), robots: 'noindex',
        body: joinBody(ctx, { values, errors, action: `${ctx.base}/join` }),
      }, 400)
    const verdict = await botVerdict(c, ctx, values, { ipHash: ip })
    const { id, token } = await createListing(ctx.db, ctx.operatorId, ctx.config,
      { ...values, status: verdict.decision === 'approve' ? 'live' : 'pending' })
    await logVerdict(ctx, verdict, '', { workerId: id, ipHash: ip, values })
    const photos = ctx.config.photos ? await takePhotos(c, ctx, id, body.photos, 0) : null
    let live = verdict.decision === 'approve'
    if (photos?.sexual) {
      live = false
      await logEvent(ctx.db, ctx.operatorId, 'hold', { workerId: id, ipHash: ip, name: values.display_name, detail: { reasons: ['sexual-photo'], categories: values.categories } })
    }
    c.header('Cache-Control', 'no-store')
    c.header('Referrer-Policy', 'no-referrer')
    return render(c, {
      title: ctx.t('done.title'), robots: 'noindex',
      body: doneBody(ctx, `${ctx.origin}${ctx.base}/edit/${token}`, { live, workerId: id, photos }),
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
      body: editBody(ctx, w, {
        values: valuesFromWorker(w), token, saved: ctx.query.saved,
        photos: await listPhotos(ctx.db, ctx.operatorId, w.id), report: reportFromQuery(ctx.query),
      }),
    })
  })

  app.post('/edit/:token', selfListing, async (c) => {
    const ctx = c.get('ctx')
    const token = c.req.param('token')
    const w = await findByEditToken(ctx.db, ctx.operatorId, token)
    if (!w) return render(c, { title: '404', body: html`<h1>404</h1>`, robots: 'noindex' }, 404)
    const body = await c.req.parseBody({ all: true })
    const { values, errors } = readListingForm(ctx.config, body)
    c.header('Referrer-Policy', 'no-referrer')
    if (errors.length) {
      const photos = await listPhotos(ctx.db, ctx.operatorId, w.id)
      return render(c, { title: ctx.t('edit.title'), robots: 'noindex', body: editBody(ctx, w, { values, errors, token, photos }) }, 400)
    }
    // every edit is screened again: a clean listing edited into an advert
    // goes back to waiting
    const ip = ipHash(c)
    const verdict = await botVerdict(c, ctx, values, { ipHash: ip, excludeId: w.id })
    const { review } = await updateListing(ctx.db, ctx.operatorId, ctx.config, w.id,
      { ...values, status: verdict.decision === 'approve' ? 'live' : 'pending' })
    await logVerdict(ctx, verdict, 'edit-', { workerId: w.id, ipHash: ip, values })
    let report = null
    if (ctx.config.photos) {
      const drop = new Set([].concat(body.remove_photo ?? []).map(String))
      const have = await listPhotos(ctx.db, ctx.operatorId, w.id)
      for (const p of have) if (drop.has(p.id)) await dropPhoto(c, ctx, p)
      report = await takePhotos(c, ctx, w.id, body.photos, have.length - have.filter((p) => drop.has(p.id)).length)
      if (report.sexual)
        await logEvent(ctx.db, ctx.operatorId, 'edit-hold', { workerId: w.id, ipHash: ip, name: values.display_name, detail: { reasons: ['sexual-photo'], categories: values.categories } })
    }
    const q = new URLSearchParams({ saved: review || report?.sexual ? 'review' : '1' })
    if (report) for (const [k, v] of Object.entries(report)) if (v && k !== 'sexual') q.set('p' + k, String(v))
    return c.redirect(`${ctx.base}/edit/${token}?${q}`, 303)
  })

  // the owner sees their own photos, held ones included, through their link
  app.get('/edit/:token/photo/:id', selfListing, async (c) => {
    const ctx = c.get('ctx')
    const w = await findByEditToken(ctx.db, ctx.operatorId, c.req.param('token'))
    const p = w && await getPhoto(ctx.db, ctx.operatorId, c.req.param('id'))
    if (!p || p.worker_id !== w.id) return c.notFound()
    return servePhoto(c, p, 'private, no-store')
  })

  app.get('/photo/:id', async (c) => {
    const ctx = c.get('ctx')
    const p = await getPhoto(ctx.db, ctx.operatorId, c.req.param('id'))
    if (!p || p.status !== 'live' || !p.worker_active) return c.notFound()
    return servePhoto(c, p, 'public, max-age=86400')
  })

  app.post('/edit/:token/remove', selfListing, async (c) => {
    const ctx = c.get('ctx')
    const w = await findByEditToken(ctx.db, ctx.operatorId, c.req.param('token'))
    if (w) {
      await removeWithPhotos(c, ctx, w.id)
      await logEvent(ctx.db, ctx.operatorId, 'remove', { workerId: w.id, ipHash: ipHash(c), name: w.display_name })
    }
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
      if (m) await logEvent(c.get('ctx').db, c.get('ctx').operatorId, 'admin-fail', { ipHash: ipHash(c) })
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
    const photos = await heldPhotos(ctx.db, ctx.operatorId)
    return render(c, { title: ctx.t('admin.title'), robots: 'noindex', body: adminBody(ctx, { pending, live, hidden, photos }) })
  })

  // before /admin/:id/:action, so 'photo' and 'digest' are not read as ids
  app.get('/admin/photo/:id', admin, async (c) => {
    const ctx = c.get('ctx')
    const p = await getPhoto(ctx.db, ctx.operatorId, c.req.param('id'))
    return p ? servePhoto(c, p, 'private, no-store') : c.notFound()
  })

  app.post('/admin/photo/:id/:action', admin, async (c) => {
    const ctx = c.get('ctx')
    const p = await getPhoto(ctx.db, ctx.operatorId, c.req.param('id'))
    if (!p) return c.notFound()
    const action = c.req.param('action')
    if (action === 'approve') await setPhotoStatus(ctx.db, ctx.operatorId, p.id, 'live')
    else if (action === 'delete') await dropPhoto(c, ctx, p)
    else return c.notFound()
    await logEvent(ctx.db, ctx.operatorId, `admin-photo-${action}`, { workerId: p.worker_id })
    return c.redirect(`${ctx.base}/admin`, 303)
  })

  // the digest as it would go out now (GET), or sent now (POST)
  app.get('/admin/digest', admin, async (c) => {
    const ctx = c.get('ctx')
    const kind = ctx.query.kind === 'interim' ? 'interim' : 'scheduled'
    const r = await runDigest(ctx.db, c.env || {}, { id: ctx.operatorId, config: ctx.config }, new Date(), { force: kind, dryRun: true })
    return c.text(`Subject: ${r.subject}\n\n${r.text}`)
  })
  app.post('/admin/digest', admin, async (c) => {
    const ctx = c.get('ctx')
    const r = await runDigest(ctx.db, c.env || {}, { id: ctx.operatorId, config: ctx.config }, new Date(), { force: 'interim' })
    return c.text(r.sent ? 'sent' : 'not sent: ' + r.why)
  })

  app.post('/admin/:id/:action', admin, async (c) => {
    const ctx = c.get('ctx')
    const id = c.req.param('id')
    const action = c.req.param('action')
    const w = await getWorker(ctx.db, ctx.operatorId, id)
    if (action === 'approve') await setListingStatus(ctx.db, ctx.operatorId, id, 'live')
    else if (action === 'hide') await setListingStatus(ctx.db, ctx.operatorId, id, 'hidden')
    else if (action === 'delete') await removeWithPhotos(c, ctx, id)
    else return c.notFound()
    await logEvent(ctx.db, ctx.operatorId, `admin-${action}`, { workerId: id, name: w?.display_name })
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

// ── the approval bot, photos, storage ───────────────────────────────────────

async function botVerdict(c, ctx, values, { ipHash, excludeId = null }) {
  const history = await screenHistory(ctx.db, ctx.operatorId,
    { phone: values.contact_phone, line: values.contact_line, ipHash, excludeId })
  if (!ctx.config.autoApprove) return { decision: 'hold', reasons: ['operator-approves-all'], ai: null }
  return screen(values, history, c.env && c.env.AI)
}

async function logVerdict(ctx, verdict, prefix, { workerId, ipHash, values }) {
  await logEvent(ctx.db, ctx.operatorId, prefix + verdict.decision, {
    workerId, ipHash, name: values.display_name,
    detail: { reasons: verdict.reasons, categories: values.categories, model: verdict.ai?.categories || null },
  })
  if (verdict.ai?.error && verdict.ai.error !== 'no-binding')
    await logEvent(ctx.db, ctx.operatorId, 'model-error', { workerId, detail: { error: verdict.ai.error } })
}

/** Check and store uploaded photos for a listing that already has `have`.
 *  Returns { added, held, person, other, over }. A refused photo is not
 *  stored anywhere. */
async function takePhotos(c, ctx, workerId, files, have) {
  const list = [].concat(files ?? []).filter((f) => f && typeof f === 'object' && typeof f.arrayBuffer === 'function' && f.size > 0)
  const r = { added: 0, held: 0, person: 0, other: 0, over: 0 }
  if (!list.length) return r
  const room = Math.max(0, MAX_PHOTOS - have)
  r.over = Math.max(0, list.length - room)
  const bucket = c.env && c.env.MEDIA
  let sort = have
  for (const f of list.slice(0, room)) {
    const cl = clean(await f.arrayBuffer())
    if (cl.error) { r.other++; await logEvent(ctx.db, ctx.operatorId, 'photo-refuse', { workerId, detail: { why: cl.error } }); continue }
    const look = await lookAt(c.env && c.env.AI, cl.bytes, cl.kind)
    if (look.verdict === 'refuse') {
      look.why === 'person' ? r.person++ : r.other++
      if (look.why === 'sexual') {
        r.sexual = (r.sexual || 0) + 1
        await setListingStatus(ctx.db, ctx.operatorId, workerId, 'pending')
      }
      await logEvent(ctx.db, ctx.operatorId, 'photo-refuse', { workerId, ipHash: ipHash(c), detail: { why: look.why, what: look.what } })
      continue
    }
    if (!bucket) { r.other++; continue }
    const id = randomUUID()
    const mime = cl.kind === 'png' ? 'image/png' : 'image/jpeg'
    const key = `${ctx.operatorId}/${workerId}/${id}.${cl.kind === 'png' ? 'png' : 'jpg'}`
    await bucket.put(key, cl.bytes, { httpMetadata: { contentType: mime } })
    const status = look.verdict === 'hold' ? 'held' : 'live'
    await addPhoto(ctx.db, ctx.operatorId, workerId, { id, key, mime, status, what: look.what, sort: sort++ })
    status === 'held' ? r.held++ : r.added++
    await logEvent(ctx.db, ctx.operatorId, status === 'held' ? 'photo-hold' : 'photo-ok', { workerId, detail: { what: look.what, why: look.why } })
  }
  return r
}

async function dropPhoto(c, ctx, p) {
  const bucket = c.env && c.env.MEDIA
  if (bucket) await bucket.delete(p.r2_key)
  await deletePhoto(ctx.db, ctx.operatorId, p.id)
}

async function removeWithPhotos(c, ctx, workerId) {
  for (const p of await listPhotos(ctx.db, ctx.operatorId, workerId)) await dropPhoto(c, ctx, p)
  await removeListing(ctx.db, ctx.operatorId, workerId)
}

async function servePhoto(c, p, cache) {
  const bucket = c.env && c.env.MEDIA
  const obj = bucket && await bucket.get(p.r2_key)
  if (!obj) return c.notFound()
  return new Response(obj.body, {
    headers: {
      'Content-Type': p.mime, 'Cache-Control': cache, 'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': 'inline', 'Content-Security-Policy': "default-src 'none'",
    },
  })
}

function reportFromQuery(q) {
  const r = {}
  for (const k of ['added', 'held', 'person', 'other', 'over']) if (q['p' + k]) r[k] = Number(q['p' + k]) || 0
  return Object.keys(r).length ? r : null
}
