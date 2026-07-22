// verify.mjs — verification tiers with PDPA data-minimization (§6, §12.5).
// T1 = operator-admin sights a government ID. We persist ONLY the assertion
// ("verified against Thai ID/passport, name matched") + a salted hash of the
// document reference. The uploaded document itself is PURGED from R2 after
// review and is never written to the database. This function embodies that:
// it accepts a doc reference, stores its hash, and returns a purge instruction
// for the caller to delete the R2 object.
import { randomUUID, createHash } from 'node:crypto'

export const TIER_RANK = { T0: 0, T1: 1, T2: 2, T3: 3 }

/** Salted hash of a sighted document reference. The salt is per-operator so
 *  the same ID under two tenants doesn't produce a linkable hash. */
export function docHash(operatorId, salt, docRef) {
  return createHash('sha256').update(`${operatorId}:${salt}:${docRef}`).digest('hex')
}

/**
 * Record a verification. Writes only the assertion + hash (no document, no raw
 * ID number). Bumps the worker's tier if this raises it. Returns
 * { verificationId, purge: { r2Key } | null } — the caller deletes purge.r2Key
 * from R2 so the document does not persist (PDPA minimization).
 */
export async function recordVerification(db, operatorId, input) {
  const {
    userId, tier = 'T1', method = 'thai_id', nameMatched = true,
    verifiedBy, docRef = null, docR2Key = null, salt = 'homematch',
    evidenceNote,
  } = input
  const note = evidenceNote ||
    `verified against ${method === 'passport' ? 'passport' : 'Thai ID'}${nameMatched ? ', name matched' : ''}`
  const id = randomUUID()
  await db.run(
    `INSERT INTO verification_record(id, user_id, operator_id, tier, method, evidence_note,
       doc_hash, name_matched, verified_by)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    id, userId, operatorId, tier, method, note,
    docRef ? docHash(operatorId, salt, docRef) : null, nameMatched ? 1 : 0, verifiedBy ?? null)

  // bump the worker profile's tier if this verification raises it
  const wp = await db.get('SELECT id, verification_tier FROM worker_profile WHERE operator_id=? AND user_id=?', operatorId, userId)
  if (wp && (TIER_RANK[tier] ?? 0) > (TIER_RANK[wp.verification_tier] ?? 0))
    await db.run('UPDATE worker_profile SET verification_tier=?, updated_at=? WHERE id=?',
      tier, new Date().toISOString(), wp.id)

  // instruct the caller to purge the sighted document from object storage
  return { verificationId: id, purge: docR2Key ? { r2Key: docR2Key } : null }
}
