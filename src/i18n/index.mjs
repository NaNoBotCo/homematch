// i18n — locale resolution, {param} interpolation, per-operator overrides.
// Every UI string flows through t(); no literals in markup (§2.3). Packs are
// additive: register a new locale here and it works everywhere.
import { en } from './en.mjs'
import { th } from './th.mjs'

const PACKS = { en, th }

/** Register an operator's override pack (partial; falls back per key). */
const overrides = new Map() // operatorId -> { locale -> {key->str} }
export function registerOverride(operatorId, locale, pack) {
  if (!overrides.has(operatorId)) overrides.set(operatorId, {})
  overrides.get(operatorId)[locale] = pack
}

function lookup(locale, key, operatorId) {
  const ov = operatorId && overrides.get(operatorId)?.[locale]
  if (ov && key in ov) return ov[key]
  const pack = PACKS[locale]
  if (pack && key in pack) return pack[key]
  if (key in en) return en[key] // last-resort fallback to the key schema
  return null
}

function interpolate(str, params) {
  if (!params) return str
  return str.replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m))
}

/** Make a bound translator for a locale (+ optional operator override). */
export function makeT(locale, operatorId) {
  const loc = PACKS[locale] ? locale : 'en'
  return (key, params) => {
    const s = lookup(loc, key, operatorId)
    return s == null ? key : interpolate(s, params)
  }
}

export const LOCALES = Object.keys(PACKS)
export { en, th }
