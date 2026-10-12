// The payment page and the box the agreement page carries. A QR with the exact
// amount; the payer's bank app shows the payee's name before they pay. The slip
// goes to Mot Dang on LINE.
import { html, raw } from '../lib/html.mjs'
import { priceOf, payQrSvg } from '../lib/pay.mjs'

const PAY_CSS = `.paybox{border:1px solid var(--border);border-radius:.75rem;padding:.9rem 1rem;margin:0 0 1rem;max-width:30rem}
.paybox .amt{font-size:1.6rem;font-weight:700;margin:.2rem 0}
.paybox svg{display:block;width:220px;height:220px;background:#fff;border-radius:.4rem;margin:.5rem 0}`

export function payBox(ctx, payeeId, kind, amount, ref) {
  const baht = priceOf(ctx.config, kind, amount)
  if (!payeeId || !baht) return ''
  const { t } = ctx
  const line = ctx.config.lineOa
  return html`<section class="paybox noprint" aria-labelledby="pay-${kind}">
<style>${raw(PAY_CSS)}</style>
<h2 id="pay-${kind}">${t('pay.' + kind)}</h2>
<p class="amt">฿${baht.toLocaleString('en-US')}${kind === 'subscription' || kind === 'pack' ? html` <span class="muted">${t('pay.perMonth')}</span>` : ''}</p>
${raw(payQrSvg(payeeId, baht, ref))}
<p>${t('pay.how')}</p>
${line ? html`<p><a class="btn" href="https://line.me/R/ti/p/${line}">${t('pay.slip')}</a></p>` : ''}
</section>`
}

export function payBody(ctx, payeeId, kind, amount) {
  const { t } = ctx
  const box = payBox(ctx, payeeId, kind, amount, 'MD-' + kind.toUpperCase().slice(0, 6))
  return html`<h1>${t('pay.title')}</h1>
${box || html`<p class="muted">${t('pay.none')}</p>`}
${kind === 'referral' && box ? html`<p class="muted">${t('pay.referralNote', { amount: Math.round(Number(amount)).toLocaleString('en-US'), pct: ctx.config.prices.referralPct })}</p>` : ''}`
}
