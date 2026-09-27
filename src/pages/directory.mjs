// directory.mjs — the Phase 0 product (§7.1). Browsable, filterable worker
// directory. Filters are LINKS (work with JS disabled); the result count is an
// aria-live region so it announces on navigation. Colour never sole signal.
import { html, raw } from '../lib/html.mjs'
import { tierStyles, workerCard } from './components.mjs'
import { operatorCategories, operatorZones } from '../lib/taxonomy.mjs'

const LANGS = ['th', 'en', 'my', 'shan']
const TIERS = ['T0', 'T1', 'T2', 'T3']
const ENGAGEMENTS = ['task', 'short', 'long']

/** Build an href that sets/clears one filter, preserving the rest. */
function filterHref(base, query, key, value) {
  const q = new URLSearchParams(query || {})
  if (value == null || q.get(key) === value) q.delete(key)
  else q.set(key, value)
  const s = q.toString()
  return base + '/' + (s ? '?' + s : '')
}

function chipRow(base, t, label, query, key, options) {
  const active = query[key]
  const anyOn = !active
  const chips = [
    html`<a class="btn ${anyOn ? 'on' : ''}" href="${filterHref(base, query, key, null)}"${anyOn ? raw(' aria-current="true"') : ''}>${t('dir.filter.any')}</a>`,
    ...options.map(({ value, label: lbl }) => {
      const on = active === value
      return html`<a class="btn ${on ? 'on' : ''}" href="${filterHref(base, query, key, value)}"${on ? raw(' aria-current="true"') : ''}>${lbl}</a>`
    }),
  ]
  return html`<div class="row"><span class="lbl" id="f-${key}">${label}</span><span role="group" aria-labelledby="f-${key}" class="chips">${chips}</span></div>`
}

export function directoryBody(ctx, workers) {
  const { config, t, query } = ctx
  const base = ctx.base || ''
  const catOpts = operatorCategories(config).map((c) => ({ value: c.key, label: t(c.label_key) }))
  const zoneOpts = operatorZones(config).map((z) => ({ value: z.key, label: t(z.label_key) }))
  const langOpts = LANGS.map((l) => ({ value: l, label: t('lang.' + l) }))
  const tierOpts = TIERS.map((x) => ({ value: x, label: t('tier.' + x) }))
  const engOpts = ENGAGEMENTS.map((e) => ({ value: e, label: t('engagement.' + e) }))
  const labels = { cat: (k) => t('cat.' + k), zone: (k) => t('zone.' + k) }
  const count = workers.length === 1 ? t('dir.count.one') : t('dir.count', { n: workers.length })
  const joinUrl = config.hostname ? `https://${config.hostname}${base}/join` : ''
  const cta = config.selfListing ? html`
<div class="cta">
  <a class="btn primary" href="${base}/join">${t('dir.joinCta')}</a>
  ${joinUrl ? html`<a class="btn" href="https://line.me/R/share?text=${encodeURIComponent(t('join.title') + ' ' + joinUrl)}">${t('dir.shareJoin')}</a>` : ''}
</div>` : ''
  const shelves = (config.shelfLinks || []).length ? html`
<p class="muted">${t('nav.shelf')}: ${(config.shelfLinks).map((s, i) => html`${i ? raw(' · ') : ''}<a href="${s.href}">${s[ctx.locale] || s.en}</a>`)}</p>` : ''

  return html`
${tierStyles()}
<h1>${t('dir.title', { city: cityName(config, ctx.locale) })}</h1>
${config.selfListing ? html`<p class="lede">${t('dir.lede')}</p>` : ''}
${cta}
<section class="filters" aria-label="${t('action.search')}">
  ${chipRow(base, t, t('dir.filter.category'), query, 'category', catOpts)}
  ${chipRow(base, t, t('dir.filter.zone'), query, 'zone', zoneOpts)}
  ${chipRow(base, t, t('dir.filter.language'), query, 'language', langOpts)}
  ${chipRow(base, t, t('dir.filter.engagement'), query, 'engagement', engOpts)}
  ${config.showTiers !== false ? chipRow(base, t, t('dir.filter.tier'), query, 'tier', tierOpts) : ''}
</section>
<p aria-live="polite" class="muted"><strong>${count}</strong></p>
${workers.length === 0
  ? html`<div class="wcard"><p>${t('dir.empty')}</p><p class="muted">${t('dir.emptyHint')}</p></div>`
  : html`<ul class="card-list">${workers.map((w) => workerCard(ctx, w, labels))}</ul>`}
${shelves}
`
}

export function cityName(config, locale) {
  const z = config.cityName
  if (z) return z[locale] || z.en || ''
  // fall back to brand tail
  return config.brandName.replace(/^HomeMatch\s*/, '')
}
