// profile.mjs — worker detail. Contact details are WITHHELD until reveal
// conditions (§6); we show the notice, not the number, in Phase 0. Tier badge,
// rates, services, areas, languages all labelled (never colour-only).
import { html, raw } from '../lib/html.mjs'
import { tierStyles, tierBadge, unitKey } from './components.mjs'

export function profileBody(ctx, w) {
  const { config, t, locale } = ctx
  const about = (locale === 'th' ? w.about_th : w.about_en) || w.about_en || w.about_th
  const catLabel = (k) => t('cat.' + k)
  return html`
${tierStyles()}
<p><a href="/">← ${t('nav.directory')}</a></p>
<div style="display:flex;justify-content:space-between;gap:.5rem;align-items:start">
  <h1 style="margin-bottom:.25rem">${w.display_name || catLabel(w.headline_category)}</h1>
  ${tierBadge(t, w.verification_tier)}
</div>
<p class="muted">${catLabel(w.headline_category)}${w.years_experience ? raw(' · ') + t('common.yearsExp', { n: w.years_experience }) : ''}${w.live_in_possible ? raw(' · ') + t('common.liveIn') : ''}</p>

${about ? html`<h2>${t('profile.about')}</h2><p>${about}</p>` : ''}

<h2>${t('profile.services')}</h2>
<div class="chips">${w.categories.map((c) => html`<span class="chip">${catLabel(c)}</span>`)}</div>

${w.rates && w.rates.length ? html`
<h2>${t('profile.rates')}</h2>
<ul class="rates">
  ${w.rates.map((r) => html`<li><span>${catLabel(r.category_key)}</span><span>${t('common.baht')}${r.amount ?? '—'} ${t(unitKey(r.unit))}${r.negotiable ? raw(' · ') + t('common.negotiable') : ''}</span></li>`)}
</ul>` : ''}

<h2>${t('profile.areas')}</h2>
<div class="chips">${w.zones.map((z) => html`<span class="chip">${t('zone.' + z)}</span>`)}</div>

<h2>${t('profile.languages')}</h2>
<div class="chips">${w.languages.map((l) => html`<span class="chip">${t('lang.' + l)}</span>`)}</div>

${w.engagements && w.engagements.length ? html`
<h2>${t('profile.engagement')}</h2>
<div class="chips">${w.engagements.map((e) => html`<span class="chip">${t('engagement.' + e)}</span>`)}</div>` : ''}

${w.license_number ? html`<p><strong>${t('profile.license')}:</strong> ${w.license_number}</p>` : ''}
${w.certificate_note ? html`<p><strong>${t('profile.certificate')}:</strong> ${w.certificate_note}</p>` : ''}

<div class="wcard" style="margin-top:1.25rem">
  <p class="muted">${t('profile.contactHidden')}</p>
  <button class="btn" type="button" disabled aria-disabled="true">${t('profile.message', { name: w.display_name || '' })}</button>
</div>
`
}
