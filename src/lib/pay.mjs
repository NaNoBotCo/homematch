// pay.mjs — what Mot Dang charges for on the home-help board, and the PromptPay
// QR that carries payee and exact amount. Prices: Nan 2026-10-12 ("mid-high,
// round numbers"), kept in the tenant's `prices`. The payee is env.PROMPTPAY_ID
// (a Worker secret); with none set, nothing offers payment.
import { promptPayPayload } from './promptpay.mjs'
import { qrToSvg } from './qr.mjs'

export const KINDS = ['agreement', 'subscription', 'pack', 'referral']

/** Whole baht to charge for one kind, or null. `amount` is the booking total for a referral. */
export function priceOf(config, kind, amount) {
  const p = config.prices || {}
  if (kind === 'referral') {
    const total = Math.round(Number(amount))
    if (!(total > 0) || !p.referralPct) return null
    return Math.max(1, Math.round(total * p.referralPct / 100))
  }
  const v = p[kind]
  return Number.isInteger(v) && v > 0 ? v : null
}

/** An inline SVG QR for `baht` to the payee, with a short reference banks show as the bill number. */
export function payQrSvg(payeeId, baht, ref) {
  const payload = promptPayPayload({ payeeId, satang: baht * 100, oneTime: true, merchantName: 'Mot Dang', ref })
  return qrToSvg(payload, { ecl: 'M', border: 4, scale: 6, dark: '#000', light: '#fff', title: `PromptPay ${baht} THB` })
}
