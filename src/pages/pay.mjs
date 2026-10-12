// The payment page and the box the agreement page carries. A QR with the exact
// amount; the payer's bank app shows the payee's name before they pay. With the
// slip check on, the payer uploads the slip and the page opens on its own; with
// it off, the slip goes to Mot Dang on LINE.
import { html, raw } from '../lib/html.mjs'
import { priceOf, payQrSvg } from '../lib/pay.mjs'

const PAY_CSS = `.paybox{border:1px solid var(--border);border-radius:.75rem;padding:.9rem 1rem;margin:0 0 1rem;max-width:30rem}
.paybox .amt{font-size:1.6rem;font-weight:700;margin:.2rem 0}
.paybox svg{display:block;width:220px;height:220px;background:#fff;border-radius:.4rem;margin:.5rem 0}
.paybox form{margin:.6rem 0 0}.paybox input[type=file]{display:block;margin:.4rem 0 .6rem;max-width:100%}
.paybox .err{color:#b3261e;font-weight:700}`

/** `pay` = { payeeId, slip } from the Worker's env; `back` = where a confirmed payment returns to. */
const ERRS = ['nofile', 'unread', 'amount', 'receiver', 'used', 'late', 'service', 'off']

export function payBox(ctx, pay, kind, amount, ref, { back = '', err = '' } = {}) {
  if (!ERRS.includes(err)) err = ''
  const baht = priceOf(ctx.config, kind, amount)
  if (!pay.payeeId || !baht) return ''
  const { t } = ctx
  const base = ctx.base || ''
  const line = ctx.config.lineOa
  return html`<section class="paybox noprint" aria-labelledby="pay-${kind}">
<style>${raw(PAY_CSS)}</style>
<h2 id="pay-${kind}">${t('pay.' + kind)}</h2>
<p class="amt">฿${baht.toLocaleString('en-US')}${kind === 'subscription' || kind === 'pack' ? html` <span class="muted">${t('pay.perMonth')}</span>` : ''}</p>
${raw(payQrSvg(pay.payeeId, baht, ref))}
<p>${t('pay.how')}</p>
${pay.slip ? html`<form method="post" action="${base}/pay/verify" enctype="multipart/form-data">
  <input type="hidden" name="for" value="${kind}">
  ${amount ? html`<input type="hidden" name="amount" value="${String(Math.round(Number(amount)))}">` : ''}
  <input type="hidden" name="back" value="${back}">
  ${err ? html`<p class="err" role="alert">${t('pay.err.' + err)}</p>` : ''}
  <label for="slip-${kind}">${t('pay.slipUpload')}</label>
  <input id="slip-${kind}" type="file" name="slip" accept="image/*" required>
  <button class="btn primary" type="submit">${t('pay.check')}</button>
</form>` : line ? html`<p><a class="btn" href="https://line.me/R/ti/p/${line}">${t('pay.slip')}</a></p>` : ''}
</section>`
}

export function payBody(ctx, pay, kind, amount, opts = {}) {
  const { t } = ctx
  const box = payBox(ctx, pay, kind, amount, 'MD-' + kind.toUpperCase().slice(0, 6), opts)
  return html`<h1>${t('pay.title')}</h1>
${box || html`<p class="muted">${t('pay.none')}</p>`}
${kind === 'referral' && box ? html`<p class="muted">${t('pay.referralNote', { amount: Math.round(Number(amount)).toLocaleString('en-US'), pct: ctx.config.prices.referralPct })}</p>` : ''}`
}

export function paidBody(ctx, kind, baht) {
  const { t } = ctx
  return html`<h1>${t('pay.paidTitle')}</h1>
<p>${t('pay.paidLine', { what: t('pay.' + kind), amount: baht.toLocaleString('en-US') })}</p>`
}
