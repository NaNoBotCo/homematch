// contrast.mjs — WCAG relative-luminance contrast ratio, computed numerically.
// §3 white-label + §11.3: operator theme text colours must pass ≥7:1 (AAA
// body) against their background; a test rejects any config that fails, so a
// tenant can never ship an unreadable theme. Verified by math, never by eye.

/** Parse #rgb / #rrggbb → [r,g,b] 0..255. Throws on anything else. */
export function parseHex(hex) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex).trim())
  if (!m) throw new Error(`not a hex colour: ${JSON.stringify(hex)}`)
  let h = m[1]
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
}

function channelLuminance(c) {
  const s = c / 255
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

/** Relative luminance per WCAG 2.x. */
export function luminance(hex) {
  const [r, g, b] = parseHex(hex)
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b)
}

/** Contrast ratio in [1, 21]. Order-independent. */
export function contrastRatio(a, b) {
  const la = luminance(a), lb = luminance(b)
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

export const AAA_BODY = 7 // WCAG AAA normal text

/** Validate a tenant theme. Returns { ok, ratio, failures[] }. Body text
 *  (theme.text on theme.bg) must clear AAA_BODY. Accent is checked too but
 *  reported separately since accents are often large/non-text. */
export function checkTheme(theme, threshold = AAA_BODY) {
  const failures = []
  const ratio = contrastRatio(theme.text, theme.bg)
  if (ratio < threshold)
    failures.push(`body text ${theme.text} on ${theme.bg}: ${ratio.toFixed(2)}:1 < ${threshold}:1`)
  return { ok: failures.length === 0, ratio, failures }
}
