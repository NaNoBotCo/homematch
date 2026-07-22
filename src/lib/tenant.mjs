// tenant.mjs — resolve the operator (tenant) for a request by hostname and
// expose its parsed config. Single deployment serves many operators keyed by
// host (§3). A tenant's theme is contrast-guarded at load so an unreadable
// theme can never take effect.

import { checkTheme } from './contrast.mjs'

/** Throw if a tenant config is structurally invalid or fails the contrast
 *  floor. Call at seed/config-write time so bad configs never persist. */
export function assertConfigValid(config) {
  for (const k of ['brandName', 'theme', 'locales', 'defaultLocale'])
    if (config[k] == null) throw new Error(`tenant config missing ${k}`)
  for (const k of ['bg', 'text', 'accent'])
    if (!config.theme[k]) throw new Error(`tenant theme missing ${k}`)
  const c = checkTheme(config.theme)
  if (!c.ok) throw new Error(`tenant theme fails contrast: ${c.failures.join('; ')}`)
  if (!config.locales.includes(config.defaultLocale))
    throw new Error('defaultLocale not in locales')
  return config
}

/** Resolve tenant by request hostname. Returns { operator, config } or null.
 *  Host may include a port; we match on the bare hostname. */
export async function resolveTenant(db, host) {
  const hostname = String(host || '').split(':')[0].toLowerCase()
  const operator = await db.get('SELECT * FROM operator WHERE hostname = ?', hostname)
  if (!operator) return null
  let config
  try {
    config = JSON.parse(operator.config_json)
  } catch {
    return null
  }
  return { operator, config }
}
