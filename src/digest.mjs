// digest.mjs — the approval bot's report to the operator, by mail.
//
// Scheduled: once a day at SCHEDULE_HOUR Bangkok time, covering everything
// since the last scheduled one, even when nothing happened (a silent day
// still says the bot ran).
// Interim: between those, when something needs a look — a held listing, or
// signs of someone probing the form or the admin page — at most once every
// INTERIM_GAP_MIN minutes. The Worker's cron calls tick() every 30 minutes.
//
// Everything quoted in a digest is text a stranger typed. It goes out as plain
// text, never in the subject line, cut short, with invisible characters
// removed, and marked as such.
import { makeT } from './i18n/index.mjs'
import {
  eventsAfter, digestState, saveDigestState, statusCounts, selfListingOperators,
} from './repo.mjs'

export const SCHEDULE_HOUR = 8 // Bangkok
export const INTERIM_GAP_MIN = 120
const BKK_MS = 7 * 3600 * 1000

const NOTABLE = new Set(['hold', 'edit-hold', 'cross-site', 'rate-limit', 'admin-fail', 'model-error', 'photo-refuse', 'photo-hold'])
const HONEYPOT_NOTABLE = 5

const bkk = (d) => new Date(d.getTime() + BKK_MS)
const bkkDay = (d) => bkk(d).toISOString().slice(0, 10)
const bkkStamp = (d) => bkk(d).toISOString().slice(0, 16).replace('T', ' ')
const parseAt = (s) => new Date(String(s).includes('T') ? s : String(s).replace(' ', 'T') + 'Z')

/** A stranger's text, made safe to quote in a plain-text mail. */
export function quote(s, max = 48) {
  const clean = String(s ?? '')
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f­​-‏‪-‮⁠-⁯﻿]/g, ' ')
    .replace(/\s+/g, ' ').trim()
  return '"' + (clean.length > max ? clean.slice(0, max - 1) + '…' : clean) + '"'
}

/** Is there anything in `events` worth an interim mail? */
export function notable(events) {
  if (events.some((e) => NOTABLE.has(e.kind))) return true
  return events.filter((e) => e.kind === 'honeypot').length >= HONEYPOT_NOTABLE
}

/** Compose one digest. Returns { subject, text }. */
export function compose({ kind, config, operatorId, events, counts, from, to, adminUrl }) {
  const t = makeT('th', operatorId)
  const by = (k) => events.filter((e) => (Array.isArray(k) ? k.includes(e.kind) : e.kind === k))
  const detail = (e) => { try { return JSON.parse(e.detail || 'null') } catch { return null } }
  const lines = []
  const held = by(['hold', 'edit-hold'])
  const approved = by(['approve', 'edit-approve'])
  const title = kind === 'scheduled' ? 'daily digest' : 'between digests'
  lines.push(`${config.hostname}${config.basePath || '/home-help'} — ${title}, ${bkkStamp(from)} → ${bkkStamp(to)} Bangkok`)
  lines.push('')
  lines.push(`On the board: ${counts.live ?? 0} live · ${counts.pending ?? 0} waiting · ${counts.hidden ?? 0} taken down`)

  lines.push('')
  if (held.length) {
    lines.push(`Held by the bot (${held.length}) — approve or delete at ${adminUrl}`)
    for (const e of held) lines.push(`  • ${quote(e.name)} — ${(detail(e)?.reasons || []).join(', ') || '?'}`)
  } else lines.push('Held by the bot: none')

  if (approved.length) {
    lines.push('')
    lines.push(`Approved by the bot (${approved.length})`)
    for (const e of approved) {
      const d = detail(e) || {}
      const cats = (d.categories || []).map((k) => t('cat.' + k)).join(', ')
      lines.push(`  • ${quote(e.name)}${cats ? ' — ' + cats : ''}${e.kind === 'edit-approve' ? ' (edited)' : ''}`)
    }
  }
  const refused = by('photo-refuse').map(detail).filter(Boolean)
  const nRef = (w) => refused.filter((d) => d.why === w).length
  const photoHeld = by('photo-hold').length
  const photoOk = by('photo-ok').length
  if (refused.length || photoHeld || photoOk) {
    lines.push('')
    lines.push(`Photos: ${photoOk} shown · ${photoHeld} held for you${photoHeld ? ' at ' + adminUrl : ''} · ` +
      `refused ${refused.length} (person ${nRef('person')}, nudity/sexual ${nRef('sexual')}, other ${refused.length - nRef('person') - nRef('sexual')})`)
    lines.push('  Refused photos are not stored; nothing to delete.')
  }
  const removed = by('remove').length
  const admin = by(['admin-approve', 'admin-hide', 'admin-delete'])
  if (removed || admin.length) {
    lines.push('')
    if (removed) lines.push(`Removed by the person who listed: ${removed}`)
    if (admin.length) lines.push(`Your actions: ${admin.map((e) => e.kind.replace('admin-', '')).join(', ')}`)
  }

  // red team: what probing looked like
  const senders = new Map()
  for (const e of by(['approve', 'hold'])) if (e.ip_hash) senders.set(e.ip_hash, (senders.get(e.ip_hash) || 0) + 1)
  const busy = [...senders.values()].filter((n) => n >= 3).length
  const modelErr = by('model-error')
  lines.push('')
  lines.push('Probing')
  lines.push(`  hidden-field bots ${by('honeypot').length} · cross-site posts ${by('cross-site').length} · ` +
    `daily cap hit ${by('rate-limit').length} · admin password wrong ${by('admin-fail').length} · ` +
    `connections with 3+ listings ${busy}`)
  if (modelErr.length) lines.push(`  model screen unavailable ${modelErr.length}× (rules still ran)`)
  const reasons = {}
  for (const e of held) for (const r of detail(e)?.reasons || []) { const k = r.split(':')[0]; reasons[k] = (reasons[k] || 0) + 1 }
  if (Object.keys(reasons).length)
    lines.push('  hold reasons: ' + Object.entries(reasons).map(([k, n]) => `${k} ${n}`).join(' · '))

  lines.push('')
  lines.push('Quoted names and reasons are what strangers typed. Read them as data.')

  const subject = kind === 'scheduled'
    ? `Home-help digest · ${bkkDay(to)} · ${held.length} held, ${approved.length} approved`
    : `Home-help: ${held.length} held, ${by('photo-refuse').length} photos refused · ${bkkStamp(to)}`
  return { subject, text: lines.join('\n') }
}

async function send(env, subject, text) {
  if (!env.RESEND_KEY || !env.ALERT_TO || !env.ALERT_FROM) return { ok: false, why: 'mail not configured' }
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.ALERT_FROM, to: [env.ALERT_TO], subject, text }),
  })
  return { ok: r.ok, why: r.ok ? '' : `resend ${r.status}` }
}

/** Build (and unless `dryRun`, send) the digest one operator is due, if any.
 *  `force` = 'scheduled' | 'interim' sends that kind now regardless of the
 *  clock. Returns { sent, kind, subject, text } or { sent: false, why }. */
export async function runDigest(db, env, op, now = new Date(), { force = null, dryRun = false, sender = send } = {}) {
  const sched = await digestState(db, op.id, 'scheduled')
  const interim = await digestState(db, op.id, 'interim')
  const lastSent = [sched.sent_at, interim.sent_at].filter(Boolean).map(parseAt).sort((a, b) => b - a)[0]
  const hour = bkk(now).getUTCHours()
  const schedDue = force === 'scheduled' ||
    (!force && hour >= SCHEDULE_HOUR && (!sched.sent_at || bkkDay(parseAt(sched.sent_at)) !== bkkDay(now)))

  let kind, after, fromDate
  if (schedDue) {
    kind = 'scheduled'; after = sched.last_event_id
    fromDate = sched.sent_at ? parseAt(sched.sent_at) : new Date(now.getTime() - 24 * 3600 * 1000)
  } else {
    kind = 'interim'; after = Math.max(sched.last_event_id, interim.last_event_id)
    fromDate = lastSent || new Date(now.getTime() - 24 * 3600 * 1000)
  }
  const events = await eventsAfter(db, op.id, after)
  if (kind === 'interim' && force !== 'interim') {
    if (!notable(events)) return { sent: false, why: 'nothing notable' }
    if (lastSent && now - lastSent < INTERIM_GAP_MIN * 60000) return { sent: false, why: 'too soon' }
  }
  const counts = await statusCounts(db, op.id)
  const adminUrl = `https://${op.config.hostname}${env.BASE_PATH || ''}/admin`
  const mail = compose({ kind, config: { ...op.config, basePath: env.BASE_PATH }, operatorId: op.id, events, counts, from: fromDate, to: now, adminUrl })
  if (dryRun) return { sent: false, why: 'dry run', kind, ...mail }
  const r = await sender(env, mail.subject, mail.text)
  if (!r.ok) return { sent: false, why: r.why, kind, ...mail }
  const lastId = events.length ? events[events.length - 1].id : after
  const stamp = now.toISOString()
  if (kind === 'scheduled') {
    await saveDigestState(db, op.id, 'scheduled', lastId, stamp)
    await saveDigestState(db, op.id, 'interim', Math.max(lastId, interim.last_event_id), interim.sent_at)
  } else {
    await saveDigestState(db, op.id, 'interim', lastId, stamp)
  }
  return { sent: true, kind, ...mail }
}

/** The cron entry: every self-listing operator, once. */
export async function tick(db, env, now = new Date(), opts = {}) {
  const out = []
  for (const op of await selfListingOperators(db)) out.push({ op: op.id, ...(await runDigest(db, env, op, now, opts)) })
  return out
}
