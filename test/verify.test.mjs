import { test } from 'node:test'
import assert from 'node:assert/strict'
import { recordVerification, docHash } from '../src/lib/verify.mjs'
import { getWorker } from '../src/repo.mjs'
import { freshDb, makeOperator, makeUser, makeWorker } from './helpers.mjs'

test('recordVerification stores only the assertion + hash, never the document', async () => {
  const db = freshDb()
  await makeOperator(db, 'cm', { hostname: 'cm.example.com' })
  const uid = await makeUser(db, 'cm', { display_name: 'Nok' })
  await makeWorker(db, 'cm', uid, { verification_tier: 'T0' })
  const admin = await makeUser(db, 'cm', { display_name: 'Admin', is_admin: 1 })

  const secretDocNumber = '1234567890123' // a Thai ID number — must NOT persist
  const res = await recordVerification(db, 'cm', {
    userId: uid, tier: 'T1', method: 'thai_id', nameMatched: true,
    verifiedBy: admin, docRef: secretDocNumber, docR2Key: 'uploads/cm/nok-id.jpg',
  })
  // the caller is instructed to purge the uploaded document
  assert.deepEqual(res.purge, { r2Key: 'uploads/cm/nok-id.jpg' })

  const row = await db.get('SELECT * FROM verification_record WHERE id=?', res.verificationId)
  assert.equal(row.tier, 'T1')
  assert.match(row.evidence_note, /Thai ID, name matched/)
  // the raw ID number appears NOWHERE in the stored row
  assert.equal(JSON.stringify(row).includes(secretDocNumber), false, 'raw ID number not persisted')
  // only a salted hash is kept, and it matches the expected derivation
  assert.equal(row.doc_hash, docHash('cm', 'homematch', secretDocNumber))

  // the worker profile tier was bumped T0 → T1
  const w = await getWorker(db, 'cm', (await db.get('SELECT id FROM worker_profile WHERE user_id=?', uid)).id)
  assert.equal(w.verification_tier, 'T1')
})

test('verification never lowers a tier', async () => {
  const db = freshDb()
  await makeOperator(db, 'cm', { hostname: 'cm.example.com' })
  const uid = await makeUser(db, 'cm')
  const wid = await makeWorker(db, 'cm', uid, { verification_tier: 'T2' })
  await recordVerification(db, 'cm', { userId: uid, tier: 'T1', method: 'thai_id' })
  const w = await getWorker(db, 'cm', wid)
  assert.equal(w.verification_tier, 'T2', 'a T1 record does not downgrade a T2 worker')
})

test('doc hash is per-operator (same ID under two tenants → different hash)', () => {
  assert.notEqual(docHash('a', 's', 'ID1'), docHash('b', 's', 'ID1'))
})
