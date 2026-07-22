// components.mjs — shared render pieces. Verification tier and every status
// signal carry GLYPH + LABEL, never colour alone (§2.1, §6).
import { html, raw } from '../lib/html.mjs'

const TIER_CSS = raw(`
.tier{display:inline-flex;align-items:center;gap:.35rem;padding:.15rem .5rem;border:1px solid var(--border);
  border-radius:.5rem;font-size:.8rem}
.tier .g{font-weight:700}
.card-list{list-style:none;padding:0;margin:1rem 0;display:grid;gap:.75rem}
.wcard{border:1px solid var(--border);border-radius:.75rem;background:var(--card);padding:.9rem;position:relative}
.wcard h3{margin:0 0 .25rem;font-size:1.1rem}
/* stretched link: the whole card is the tap target (≥44px), title stays small */
.wcard h3 a{text-decoration:none;color:var(--text)}
.wcard h3 a::after{content:"";position:absolute;inset:0}
.wcard a:not(h3 a){position:relative;z-index:1}
.wcard .roman{color:var(--muted);font-size:.85rem}
.chips{display:flex;flex-wrap:wrap;gap:.35rem;margin:.4rem 0}
.chip{font-size:.8rem;padding:.15rem .5rem;border:1px solid var(--border);border-radius:.5rem;color:var(--muted)}
.assisted{font-size:.78rem;color:var(--muted);border:1px dashed var(--border);border-radius:.5rem;padding:.15rem .5rem;display:inline-block}
.filters{display:grid;gap:.6rem;margin:.5rem 0 1rem}
.filters .row{display:flex;flex-wrap:wrap;gap:.3rem;align-items:center}
.filters .lbl{font-size:.8rem;color:var(--muted);min-width:5.5rem}
.rates{list-style:none;padding:0;margin:.3rem 0}
.rates li{display:flex;gap:.5rem;justify-content:space-between;max-width:22rem;padding:.15rem 0;border-bottom:1px solid var(--border)}
`)

export function tierStyles() { return html`<style>${TIER_CSS}</style>` }

/** Verification badge: glyph + text label (shape+label, never colour-only).
 *  `tier` is the bare code stored on the profile ('T0'..'T3'); labels live
 *  under the 'tier.<code>' i18n keys. */
export function tierBadge(t, tier) {
  return html`<span class="tier" title="${t('tier.explain')}"><span class="g" aria-hidden="true">${t('tier.' + tier + '.glyph')}</span>${t('tier.' + tier)}</span>`
}

/** Compact worker card for the directory. `labels` = {cat:fn, zone:fn}. */
export function workerCard(t, w, labels) {
  const cats = w.categories.map((c) => html`<span class="chip">${labels.cat(c)}</span>`)
  const reply = w.reply_bucket ? t('reply.' + w.reply_bucket) : t('reply.none')
  const rate = w.rates && w.rates[0]
  return html`
<li class="wcard">
  <div style="display:flex;justify-content:space-between;gap:.5rem;align-items:start">
    <h3><a href="/w/${w.id}">${w.display_name || t('cat.' + w.headline_category)}</a></h3>
    ${tierBadge(t, w.verification_tier)}
  </div>
  <div class="chips">${cats}</div>
  <p class="muted" style="margin:.25rem 0">
    ${w.zones.map((z) => labels.zone(z)).join(' · ')}
    ${w.live_in_possible ? raw(' · ') + t('common.liveIn') : ''}
  </p>
  ${rate ? html`<p style="margin:.25rem 0">${t('common.baht')}${rate.amount ?? '—'} ${t(unitKey(rate.unit))}${rate.negotiable ? raw(' · ') + t('common.negotiable') : ''}</p>` : ''}
  <p class="muted" style="font-size:.82rem;margin:.25rem 0">${reply}</p>
  ${w.assisted ? html`<span class="assisted">${t('dir.assisted')}</span>` : ''}
</li>`
}

export function unitKey(unit) {
  return { hour: 'common.perHour', visit: 'common.perVisit', day: 'common.perDay', month: 'common.perMonth' }[unit] || 'common.perVisit'
}
