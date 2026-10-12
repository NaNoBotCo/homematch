// slip.mjs — confirm a PromptPay payment from the payer's bank slip with SlipOK
// (Nan 2026-10-12, option A). The money goes straight to the payee; SlipOK reads
// the slip's QR, asks the bank, and answers with the amount and the bank's
// reference. With `log` on, SlipOK also refuses a slip it has seen before.
// Secrets: SLIPOK_KEY and SLIPOK_BRANCH.

export const slipOn = (env) => !!(env && env.SLIPOK_KEY && env.SLIPOK_BRANCH && env.PROMPTPAY_ID)

// SlipOK's codes for a slip that is real but not this payment.
const WHY = { 1010: 'late', 1012: 'used', 1013: 'amount', 1014: 'receiver' }

/** { ok, transRef, amount } or { ok:false, why } — why is a pay.err.* key tail. */
export async function checkSlip(env, file, baht, fetcher = fetch) {
  if (!slipOn(env)) return { ok: false, why: 'off' }
  if (!file || typeof file === 'string' || !file.size) return { ok: false, why: 'nofile' }
  if (file.size > 8 * 1024 * 1024) return { ok: false, why: 'nofile' }
  const form = new FormData()
  form.append('files', file, file.name || 'slip.jpg')
  form.append('amount', String(baht))
  form.append('log', 'true')
  let r, j
  try {
    r = await fetcher(`https://api.slipok.com/api/line/apikey/${encodeURIComponent(env.SLIPOK_BRANCH)}`, {
      method: 'POST', headers: { 'x-authorization': env.SLIPOK_KEY }, body: form,
    })
    j = await r.json()
  } catch {
    return { ok: false, why: 'service' }
  }
  const d = j && j.data
  if (j && j.success && d && d.success && d.transRef && Number(d.amount) >= baht) {
    return { ok: true, transRef: String(d.transRef), amount: Number(d.amount) }
  }
  return { ok: false, why: WHY[j && j.code] || (r.status >= 500 ? 'service' : 'unread') }
}
