// app.mjs — the Hono application, portable across the Worker runtime (D1) and
// the local node dev server (node:sqlite). It receives a db-adapter factory so
// the same routes run in both. Server-rendered HTML; no SPA (§3).
import { Hono } from 'hono'
import { resolveTenant } from './lib/tenant.mjs'
import { makeT } from './i18n/index.mjs'
import { listWorkers, getWorker } from './repo.mjs'
import { page } from './pages/layout.mjs'
import { directoryBody } from './pages/directory.mjs'
import { profileBody } from './pages/profile.mjs'
import { html } from './lib/html.mjs'

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
    const locale = pickLocale(query.lang, c.req.header('cookie'), tenant.config)
    c.set('ctx', {
      db, config: tenant.config, operatorId: tenant.operator.id,
      locale, t: makeT(locale, tenant.operator.id),
      path: url.pathname, query,
    })
    await next()
  })

  app.get('/', async (c) => {
    const ctx = c.get('ctx')
    const filters = {
      category: ctx.query.category, zone: ctx.query.zone, language: ctx.query.language,
      engagement: ctx.query.engagement, tier: ctx.query.tier, sort: ctx.query.sort,
    }
    const workers = await listWorkers(ctx.db, ctx.operatorId, filters)
    return c.html(page(ctx, { title: ctx.t('nav.directory'), body: directoryBody(ctx, workers) }).toString())
  })

  app.get('/w/:id', async (c) => {
    const ctx = c.get('ctx')
    const w = await getWorker(ctx.db, ctx.operatorId, c.req.param('id'))
    if (!w) return c.html(page(ctx, { title: '404', body: html`<h1>404</h1>` }).toString(), 404)
    return c.html(page(ctx, { title: w.display_name, body: profileBody(ctx, w) }).toString())
  })

  app.get('/how', async (c) => {
    const ctx = c.get('ctx')
    const body = html`<h1>${ctx.t('page.how.title')}</h1><p>${ctx.t('page.how.body')}</p>
      <p class="muted">${ctx.t('legal.notEmployer')}</p>`
    return c.html(page(ctx, { title: ctx.t('page.how.title'), body }).toString())
  })

  app.get('/about', async (c) => {
    const ctx = c.get('ctx')
    const body = html`<h1>${ctx.t('page.about.title')}</h1><p>${ctx.t('page.how.body')}</p>`
    return c.html(page(ctx, { title: ctx.t('page.about.title'), body }).toString())
  })

  app.get('/privacy', async (c) => {
    const ctx = c.get('ctx')
    const body = html`<h1>${ctx.t('page.privacy.title')}</h1><p>${ctx.t('legal.notEmployer')}</p>`
    return c.html(page(ctx, { title: ctx.t('page.privacy.title'), body }).toString())
  })

  return app
}

function pickLocale(langParam, cookie, config) {
  const allowed = config.locales || ['th', 'en']
  if (langParam && allowed.includes(langParam)) return langParam
  const m = /(?:^|;\s*)lang=([a-z-]+)/.exec(cookie || '')
  if (m && allowed.includes(m[1])) return m[1]
  return config.defaultLocale || allowed[0]
}
