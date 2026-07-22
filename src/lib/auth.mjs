// auth.mjs — session cookies (signed, httpOnly) + phone OTP (T0) + roles.
// Uses node:crypto, available in the Worker runtime under nodejs_compat and in
// node for dev/tests. Codes and session tokens are never stored in the clear:
// the session row IS the token; the cookie carries id + HMAC so a forged
// cookie can't name a session it doesn't know the secret for.
import { createHmac, randomUUID, randomInt, timingSafeEqual, createHash } from 'node:crypto'

const COOKIE = 'hm_session'
const SESSION_TTL_DAYS = 30
const OTP_TTL_MIN = 10
const OTP_MAX_ATTEMPTS = 5

// Expiry timestamps are stored as full ISO-8601 WITH the trailing Z, so
// `new Date(stored)` re-parses as unambiguous UTC. (A space-separated,
// Z-stripped form would be re-read as LOCAL time and skew by the tz offset.)
const isoZ = (ms) => new Date(ms).toISOString()
const nowMs = () => Date.now()

// ---- signing -------------------------------------------------------------
function sign(value, secret) {
  return createHmac('sha256', secret).update(value).digest('base64url')
}
/** cookie value = "<sessionId>.<hmac>" */
export function makeCookieValue(sessionId, secret) {
  return `${sessionId}.${sign(sessionId, secret)}`
}
export function readCookieValue(raw, secret) {
  if (!raw) return null
  const dot = raw.lastIndexOf('.')
  if (dot < 0) return null
  const id = raw.slice(0, dot), mac = raw.slice(dot + 1)
  const expect = sign(id, secret)
  if (mac.length !== expect.length) return null
  if (!timingSafeEqual(Buffer.from(mac), Buffer.from(expect))) return null
  return id
}

export function sessionCookieHeader(value, { secure = true } = {}) {
  const parts = [`${COOKIE}=${value}`, 'Path=/', 'HttpOnly', 'SameSite=Lax',
    `Max-Age=${SESSION_TTL_DAYS * 86400}`]
  if (secure) parts.push('Secure')
  return parts.join('; ')
}
export function clearCookieHeader() {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
}
export function cookieName() { return COOKIE }

// ---- sessions ------------------------------------------------------------
export async function createSession(db, operatorId, userId) {
  const id = randomUUID()
  const exp = isoZ(nowMs() + SESSION_TTL_DAYS * 86400_000)
  await db.run('INSERT INTO session(id, user_id, operator_id, expires_at) VALUES (?,?,?,?)',
    id, userId, operatorId, exp)
  return id
}
/** Resolve the signed cookie to a live user row, scoped to the operator. */
export async function sessionUser(db, operatorId, cookieHeader, secret) {
  const raw = readCookie(cookieHeader, COOKIE)
  const id = readCookieValue(raw, secret)
  if (!id) return null
  const s = await db.get('SELECT * FROM session WHERE id=? AND operator_id=?', id, operatorId)
  if (!s) return null
  if (new Date(s.expires_at).getTime() < nowMs()) return null
  return db.get('SELECT * FROM app_user WHERE id=? AND operator_id=?', s.user_id, operatorId)
}
export async function destroySession(db, id) {
  await db.run('DELETE FROM session WHERE id=?', id)
}

// ---- OTP (T0 phone verification + account claim) -------------------------
const hashCode = (operatorId, phone, code) =>
  createHash('sha256').update(`${operatorId}:${phone}:${code}`).digest('hex')

/** Create an OTP challenge. Returns { id, code } — `code` is for the SMS layer
 *  (dev logs it; prod sends it). Only the HASH is stored. */
export async function createOtp(db, operatorId, phone, purpose = 'verify') {
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
  const id = randomUUID()
  await db.run(
    `INSERT INTO otp_challenge(id, operator_id, phone, code_hash, purpose, expires_at)
     VALUES (?,?,?,?,?,?)`,
    id, operatorId, phone, hashCode(operatorId, phone, code), purpose,
    isoZ(nowMs() + OTP_TTL_MIN * 60_000))
  return { id, code }
}

/** Verify a submitted code. Returns { ok, reason? }. Enforces expiry and an
 *  attempt cap; a correct code consumes the challenge. */
export async function verifyOtp(db, operatorId, phone, code, purpose = 'verify') {
  const row = await db.get(
    `SELECT * FROM otp_challenge WHERE operator_id=? AND phone=? AND purpose=?
     ORDER BY created_at DESC LIMIT 1`, operatorId, phone, purpose)
  if (!row) return { ok: false, reason: 'no_challenge' }
  if (new Date(row.expires_at).getTime() < nowMs()) return { ok: false, reason: 'expired' }
  if (row.attempts >= OTP_MAX_ATTEMPTS) return { ok: false, reason: 'too_many_attempts' }
  const want = hashCode(operatorId, phone, code)
  const got = Buffer.from(want)
  const have = Buffer.from(row.code_hash)
  const match = got.length === have.length && timingSafeEqual(got, have)
  if (!match) {
    await db.run('UPDATE otp_challenge SET attempts=attempts+1 WHERE id=?', row.id)
    return { ok: false, reason: 'mismatch' }
  }
  await db.run('DELETE FROM otp_challenge WHERE id=?', row.id) // consume
  return { ok: true }
}

// ---- roles ---------------------------------------------------------------
export const ROLES = ['customer', 'worker', 'admin']
export function hasRole(user, role) {
  if (!user) return false
  return { customer: !!user.is_customer, worker: !!user.is_worker, admin: !!user.is_admin }[role] === true
}
/** Require operator-admin; throws a 403-shaped error otherwise. */
export function requireAdmin(user) {
  if (!hasRole(user, 'admin')) { const e = new Error('forbidden'); e.status = 403; throw e }
}

// ---- cookie parsing ------------------------------------------------------
function readCookie(header, name) {
  const m = new RegExp(`(?:^|;\\s*)${name}=([^;]+)`).exec(header || '')
  return m ? decodeURIComponent(m[1]) : null
}
