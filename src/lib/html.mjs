// html.mjs — minimal server-render helper. The `html` tagged template
// auto-escapes every interpolation (XSS-safe by default); wrap trusted,
// already-rendered fragments in raw(). No SPA, no client framework (§3).

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
export function esc(v) {
  if (v == null) return ''
  return String(v).replace(/[&<>"']/g, (c) => ESC[c])
}

class Raw {
  constructor(s) { this.s = s }
  toString() { return this.s }
}
/** Mark a string as already-safe HTML (skips escaping). Use only on strings
 *  you constructed, never on user input. */
export function raw(s) { return new Raw(s instanceof Raw ? s.s : String(s)) }

/** Tagged template that escapes interpolations. Arrays are joined. Raw and
 *  nested html() results pass through unescaped. */
export function html(strings, ...values) {
  let out = ''
  for (let i = 0; i < strings.length; i++) {
    out += strings[i]
    if (i < values.length) out += renderValue(values[i])
  }
  return new Raw(out)
}
function renderValue(v) {
  if (v == null || v === false) return ''
  if (v instanceof Raw) return v.s
  if (Array.isArray(v)) return v.map(renderValue).join('')
  return esc(v)
}
