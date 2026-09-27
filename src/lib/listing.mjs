// listing.mjs — read and check the self-listing form. Everything a worker
// types passes through here before it reaches the database: unknown keys are
// dropped, lengths are capped, and each problem comes back as an i18n key so
// the form can say it in the reader's language.
import { operatorCategories, operatorZones } from './taxonomy.mjs'

export const LANGS = ['th', 'en', 'my', 'shan']
export const ENGAGEMENTS = ['task', 'short', 'long']
export const UNITS = ['hour', 'visit', 'day', 'month', 'kg']

const list = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]).map(String)
const text = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
const para = (v, max) => String(v ?? '').replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, max)
const int = (v) => {
  const s = String(v ?? '').replace(/[,\s฿]/g, '').trim()
  if (s === '') return { value: null }
  if (!/^\d{1,7}$/.test(s)) return { bad: true }
  return { value: Number(s) }
}

/** LINE IDs: letters, digits, dot, dash, underscore; an official account
 *  starts with @. Returns the cleaned ID, '' for empty, or null if invalid. */
export function cleanLineId(v) {
  const s = String(v ?? '').trim().replace(/^line\s*(id)?\s*[:：]?\s*/i, '')
  if (s === '') return ''
  return /^@?[A-Za-z0-9._-]{2,40}$/.test(s) ? s : null
}

/** Phone numbers: keep digits (and a leading +). Thai numbers are 9–10
 *  digits with the 0; +66 forms are 11–12. Returns '' for empty, null if the
 *  digit count is outside 9–15. */
export function cleanPhone(v) {
  const s = String(v ?? '').trim()
  if (s === '') return ''
  const plus = s.startsWith('+')
  const digits = s.replace(/\D/g, '')
  if (digits.length < 9 || digits.length > 15) return null
  return (plus ? '+' : '') + digits
}

/** 0812345678 → 081-234-5678; 021234567 → 02-123-4567; others unchanged. */
export function formatPhone(p) {
  if (!p) return ''
  if (/^0\d{9}$/.test(p)) return `${p.slice(0, 3)}-${p.slice(3, 6)}-${p.slice(6)}`
  if (/^0\d{8}$/.test(p)) return `${p.slice(0, 2)}-${p.slice(2, 5)}-${p.slice(5)}`
  return p
}

/** LINE add-friend link for an ID. */
export function lineHref(id) {
  if (!id) return ''
  return id.startsWith('@')
    ? `https://line.me/R/ti/p/${encodeURIComponent(id)}`
    : `https://line.me/ti/p/~${encodeURIComponent(id)}`
}

/** Parse a submitted form body (Hono parseBody({all:true}) shape) against the
 *  operator's taxonomy. Returns { values, errors } — `values` is ready for
 *  createListing/updateListing when `errors` is empty, and is also what the
 *  form re-renders with when it is not. */
export function readListingForm(config, body) {
  const cats = new Set(operatorCategories(config).map((c) => c.key))
  const zones = new Set(operatorZones(config).map((z) => z.key))
  const errors = []

  const display_name = text(body.display_name, 40)
  if (!display_name) errors.push('err.name')
  const categories = [...new Set(list(body.categories).filter((c) => cats.has(c)))]
  if (!categories.length) errors.push('err.categories')
  const zoneKeys = [...new Set(list(body.zones).filter((z) => zones.has(z)))]
  if (!zoneKeys.length) errors.push('err.zones')
  const languages = [...new Set(list(body.languages).filter((l) => LANGS.includes(l)))]
  const engagements = [...new Set(list(body.engagements).filter((e) => ENGAGEMENTS.includes(e)))]

  const rate = int(body.rate_amount)
  if (rate.bad) errors.push('err.rate')
  const rate_unit = UNITS.includes(String(body.rate_unit)) ? String(body.rate_unit) : 'day'
  const years = int(body.years_experience)
  if (years.bad || (years.value != null && years.value > 70)) errors.push('err.years')

  const contact_line = cleanLineId(body.contact_line)
  const contact_phone = cleanPhone(body.contact_phone)
  if (contact_line === null) errors.push('err.line')
  if (contact_phone === null) errors.push('err.phone')
  if (contact_line === '' && contact_phone === '') errors.push('err.contact')

  const consent = body.consent === 'on' || body.consent === 'yes'
  if (!consent) errors.push('err.consent')

  const values = {
    display_name,
    categories,
    zones: zoneKeys,
    languages,
    engagements,
    years_experience: years.bad ? null : years.value,
    live_in_possible: body.live_in === 'on',
    about_th: para(body.about_th, 600),
    about_en: para(body.about_en, 600),
    rates: categories.length && !rate.bad && rate.value != null
      ? [{ category_key: categories[0], amount: rate.value, unit: rate_unit, negotiable: true }] : [],
    rate_amount: rate.bad ? String(body.rate_amount ?? '') : (rate.value ?? ''),
    rate_unit,
    contact_line: contact_line || null,
    contact_phone: contact_phone || null,
    raw_line: String(body.contact_line ?? ''),
    raw_phone: String(body.contact_phone ?? ''),
    indexable: body.indexable === 'on',
    consent,
  }
  return { values, errors }
}

/** Form values from a stored worker, for the edit page. */
export function valuesFromWorker(w) {
  const r = w.rates?.[0]
  return {
    display_name: w.display_name,
    categories: w.categories,
    zones: w.zones,
    languages: w.languages,
    engagements: w.engagements,
    years_experience: w.years_experience ?? '',
    live_in_possible: w.live_in_possible,
    about_th: w.about_th,
    about_en: w.about_en,
    rate_amount: r?.amount ?? '',
    rate_unit: r?.unit ?? 'day',
    raw_line: w.contact_line ?? '',
    raw_phone: w.contact_phone ?? '',
    indexable: !!w.indexable,
    consent: true,
  }
}
