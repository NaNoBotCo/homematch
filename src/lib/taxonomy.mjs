// taxonomy.mjs — service categories are DATA (§5). Labels come from i18n by
// label_key; nothing here hardcodes a display name. Title guard: a category
// may be licensed (e.g. nurse under the Nursing Profession Act) — those
// require a licence number on the profile and are OFF unless the operator
// opts in. Free-text titles can never bypass this because a profile headline
// is always chosen from category keys, never typed (§5).

/** Categories the operator has enabled, from its config. Each: {key,
 *  label_key, requires_license, wants_certificate}. */
export function operatorCategories(config) {
  return (config.categories ?? []).map((c) => ({
    key: c.key,
    label_key: c.label_key,
    requires_license: !!c.requires_license,
    wants_certificate: !!c.wants_certificate,
  }))
}

export function operatorZones(config) {
  return (config.zones ?? []).map((z) => ({ key: z.key, label_key: z.label_key }))
}

/** True if this category demands a licence number on the worker profile. */
export function categoryRequiresLicense(config, key) {
  return !!operatorCategories(config).find((c) => c.key === key)?.requires_license
}

/** Validate a worker's chosen categories against the operator taxonomy and the
 *  title guard. Returns { ok, errors[] }. A licensed category with no licence
 *  number is rejected here — the guard is server-side, not UI-only. */
export function validateWorkerCategories(config, chosenKeys, { licenseNumber } = {}) {
  const errors = []
  const allowed = new Map(operatorCategories(config).map((c) => [c.key, c]))
  if (!chosenKeys || chosenKeys.length === 0) errors.push('at least one category required')
  for (const k of chosenKeys ?? []) {
    const cat = allowed.get(k)
    if (!cat) { errors.push(`category "${k}" is not enabled for this operator`); continue }
    if (cat.requires_license && !String(licenseNumber || '').trim())
      errors.push(`category "${k}" requires a licence number`)
  }
  return { ok: errors.length === 0, errors }
}

/** Sync an operator's config taxonomy into the DB tables (idempotent upsert).
 *  Called at seed / config-write time so directory filters can query them. */
export async function syncTaxonomy(db, operatorId, config) {
  let sort = 0
  for (const c of operatorCategories(config)) {
    await db.run(
      `INSERT INTO service_category(operator_id, key, label_key, sort, requires_license, wants_certificate, active)
       VALUES (?,?,?,?,?,?,1)
       ON CONFLICT(operator_id, key) DO UPDATE SET
         label_key=excluded.label_key, sort=excluded.sort,
         requires_license=excluded.requires_license, wants_certificate=excluded.wants_certificate, active=1`,
      operatorId, c.key, c.label_key, sort++, c.requires_license ? 1 : 0, c.wants_certificate ? 1 : 0)
  }
  sort = 0
  for (const z of operatorZones(config)) {
    await db.run(
      `INSERT INTO zone(operator_id, key, label_key, sort, active) VALUES (?,?,?,?,1)
       ON CONFLICT(operator_id, key) DO UPDATE SET label_key=excluded.label_key, sort=excluded.sort, active=1`,
      operatorId, z.key, z.label_key, sort++)
  }
}
