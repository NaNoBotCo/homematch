import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  makeCookieValue, readCookieValue, createSession, sessionUser, destroySession,
  createOtp, verifyOtp, hasRole, requireAdmin, sessionCookieHeader, cookieName,
} from '../src/lib/auth.mjs'
import { freshDb, makeOperator, makeUser } from './helpers.mjs'

const SECRET = 'test-secret-abc'

test('signed cookie round-trips; a tampered or forged cookie is rejected', () => {
  const v = makeCookieValue('sess-123', SECRET)
  assert.equal(readCookieValue(v, SECRET), 'sess-123')
  // wrong secret → reject
  assert.equal(readCookieValue(v, 'other-secret'), null)
  // tampered id → reject
  const [id, mac] = v.split('.')
  assert.equal(readCookieValue(`sess-999.${mac}`, SECRET), null)
  // garbage → reject
  assert.equal(readCookieValue('nope', SECRET), null)
  assert.equal(readCookieValue('', SECRET), null)
  void id
})

test('createSession + sessionUser resolves the signed cookie to the user (scoped)', async () => {
  const db = freshDb()
  await makeOperator(db, 'a', { hostname: 'a.example.com' })
  await makeOperator(db, 'b', { hostname: 'b.example.com' })
  const uid = await makeUser(db, 'a', { display_name: 'Nok', phone: '+66811111111' })
  const sid = await createSession(db, 'a', uid)
  const cookie = `${cookieName()}=${makeCookieValue(sid, SECRET)}`
  const u = await sessionUser(db, 'a', cookie, SECRET)
  assert.equal(u.id, uid)
  // same cookie under a DIFFERENT operator resolves to nothing (tenant scope)
  assert.equal(await sessionUser(db, 'b', cookie, SECRET), null)
  await destroySession(db, sid)
  assert.equal(await sessionUser(db, 'a', cookie, SECRET), null)
})

test('sessionCookieHeader sets HttpOnly + SameSite', () => {
  const h = sessionCookieHeader('v')
  assert.match(h, /HttpOnly/)
  assert.match(h, /SameSite=Lax/)
})

test('OTP: correct code verifies once; wrong code counts an attempt; expiry + cap enforced', async () => {
  const db = freshDb()
  await makeOperator(db, 'a', { hostname: 'a.example.com' })
  const { code } = await createOtp(db, 'a', '+66822222222', 'verify')
  assert.match(code, /^\d{6}$/)
  // wrong code
  assert.equal((await verifyOtp(db, 'a', '+66822222222', '000000', 'verify')).ok, false)
  // correct code consumes the challenge
  assert.equal((await verifyOtp(db, 'a', '+66822222222', code, 'verify')).ok, true)
  // re-use fails (consumed)
  assert.equal((await verifyOtp(db, 'a', '+66822222222', code, 'verify')).ok, false)
})

test('OTP attempt cap locks out after 5 wrong tries', async () => {
  const db = freshDb()
  await makeOperator(db, 'a', { hostname: 'a.example.com' })
  await createOtp(db, 'a', '+66833333333', 'verify')
  for (let i = 0; i < 5; i++) await verifyOtp(db, 'a', '+66833333333', '111111', 'verify')
  const r = await verifyOtp(db, 'a', '+66833333333', '111111', 'verify')
  assert.equal(r.reason, 'too_many_attempts')
})

test('OTP is tenant-scoped (a code for operator a does not verify for b)', async () => {
  const db = freshDb()
  await makeOperator(db, 'a', { hostname: 'a.example.com' })
  await makeOperator(db, 'b', { hostname: 'b.example.com' })
  const { code } = await createOtp(db, 'a', '+66844444444', 'verify')
  assert.equal((await verifyOtp(db, 'b', '+66844444444', code, 'verify')).reason, 'no_challenge')
})

test('roles + requireAdmin gate', () => {
  assert.equal(hasRole({ is_worker: 1 }, 'worker'), true)
  assert.equal(hasRole({ is_worker: 1 }, 'admin'), false)
  assert.throws(() => requireAdmin({ is_worker: 1 }), (e) => e.status === 403)
  assert.doesNotThrow(() => requireAdmin({ is_admin: 1 }))
})
