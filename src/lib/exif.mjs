// exif.mjs — read what a photo says about itself: where (GPS), when
// (DateTimeOriginal) and on what (Make, Model). A small TIFF reader, enough
// for those tags and nothing else; anything malformed reads as absent.
//
// Metadata is written by whoever made the file and can be edited by anyone
// before upload. Treat it as a claim the photo makes, not a fact.

/** The raw EXIF block (TIFF header onwards) from a JPEG's APP1 segment or a
 *  PNG's eXIf chunk, or null. */
export function exifBlock(b) {
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2
    while (i + 4 <= b.length && b[i] === 0xff) {
      const m = b[i + 1]
      if (m === 0xda || m === 0xd9) break
      const len = (b[i + 2] << 8) | b[i + 3]
      if (len < 2) break
      if (m === 0xe1 && len > 8 && b[i + 4] === 0x45 && b[i + 5] === 0x78 && b[i + 6] === 0x69 && b[i + 7] === 0x66 &&
          b[i + 8] === 0 && b[i + 9] === 0)
        return b.subarray(i + 10, Math.min(b.length, i + 2 + len))
      i += 2 + len
    }
    return null
  }
  if (b[0] === 0x89 && b[1] === 0x50) {
    let i = 8
    while (i + 8 <= b.length) {
      const len = ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3]
      const type = String.fromCharCode(b[i + 4], b[i + 5], b[i + 6], b[i + 7])
      if (type === 'eXIf') return b.subarray(i + 8, Math.min(b.length, i + 8 + len))
      if (type === 'IEND') break
      i += 12 + len
    }
  }
  return null
}

/** Parse a TIFF/EXIF block. Returns { lat, lon, alt, takenAt, device } with
 *  absent fields null. */
export function readExif(t) {
  const out = { lat: null, lon: null, alt: null, takenAt: null, device: null }
  if (!t || t.length < 8) return out
  const le = t[0] === 0x49 && t[1] === 0x49
  if (!le && !(t[0] === 0x4d && t[1] === 0x4d)) return out
  const u16 = (o) => (o + 2 <= t.length ? (le ? t[o] | (t[o + 1] << 8) : (t[o] << 8) | t[o + 1]) : 0)
  const u32 = (o) => (o + 4 <= t.length
    ? (le ? (t[o] | (t[o + 1] << 8) | (t[o + 2] << 16)) + t[o + 3] * 0x1000000
      : ((t[o + 1] << 16) | (t[o + 2] << 8) | t[o + 3]) + t[o] * 0x1000000) : 0)
  const SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 }

  function ifd(off) {
    const tags = new Map()
    if (off < 8 || off + 2 > t.length) return tags
    const n = u16(off)
    if (n > 500) return tags
    for (let k = 0; k < n; k++) {
      const e = off + 2 + k * 12
      if (e + 12 > t.length) break
      const tag = u16(e), type = u16(e + 2), count = u32(e + 4)
      const bytes = (SIZE[type] || 1) * count
      if (bytes > 65536) continue
      const at = bytes <= 4 ? e + 8 : u32(e + 8)
      if (at + bytes > t.length) continue
      tags.set(tag, { type, count, at })
    }
    return tags
  }
  const ascii = (v) => {
    if (!v || v.type !== 2) return null
    let s = ''
    for (let k = 0; k < v.count && v.at + k < t.length; k++) { const c = t[v.at + k]; if (!c) break; s += String.fromCharCode(c) }
    return s.replace(/[^\x20-\x7e]/g, '').trim() || null
  }
  const rationals = (v) => {
    if (!v || (v.type !== 5 && v.type !== 10)) return null
    const r = []
    for (let k = 0; k < v.count; k++) {
      const num = u32(v.at + k * 8), den = u32(v.at + k * 8 + 4)
      r.push(den ? num / den : NaN)
    }
    return r
  }
  const ref = (v) => (v ? String.fromCharCode(t[v.at]) : null)

  const ifd0 = ifd(u32(4))
  const make = ascii(ifd0.get(0x010f)), model = ascii(ifd0.get(0x0110))
  out.device = [make, model && make && model.startsWith(make) ? model.slice(make.length).trim() : model]
    .filter(Boolean).join(' ').slice(0, 60) || null

  const exifPtr = ifd0.get(0x8769)
  const exif = exifPtr ? ifd(u32(exifPtr.at)) : new Map()
  const when = ascii(exif.get(0x9003)) || ascii(ifd0.get(0x0132))
  const m = when && /^(\d{4}):(\d\d):(\d\d) (\d\d):(\d\d):(\d\d)/.exec(when)
  if (m && m[1] !== '0000') out.takenAt = `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}:${m[6]}`

  const gpsPtr = ifd0.get(0x8825)
  if (gpsPtr) {
    const g = ifd(u32(gpsPtr.at))
    const dms = (r) => (r && r.length >= 3 && r.every(Number.isFinite) ? r[0] + r[1] / 60 + r[2] / 3600 : null)
    let lat = dms(rationals(g.get(2))), lon = dms(rationals(g.get(4)))
    if (lat != null && lon != null && !(lat === 0 && lon === 0)) {
      if (ref(g.get(1)) === 'S') lat = -lat
      if (ref(g.get(3)) === 'W') lon = -lon
      if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) { out.lat = +lat.toFixed(6); out.lon = +lon.toFixed(6) }
    }
    const a = rationals(g.get(6))
    if (a && Number.isFinite(a[0])) out.alt = +(g.get(5) && t[g.get(5).at] === 1 ? -a[0] : a[0]).toFixed(1)
  }
  return out
}

/** Great-circle distance in km. */
export function km(aLat, aLon, bLat, bLon) {
  const r = Math.PI / 180
  const d = Math.sin(((bLat - aLat) * r) / 2) ** 2 +
    Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(((bLon - aLon) * r) / 2) ** 2
  return 6371 * 2 * Math.asin(Math.sqrt(d))
}

/** Nearest operator zone (zones carrying `center: [lat, lon]`) to a point:
 *  { zone, km } or null. */
export function nearestZone(zones, lat, lon) {
  let best = null
  for (const z of zones || []) {
    if (!Array.isArray(z.center)) continue
    const d = km(lat, lon, z.center[0], z.center[1])
    if (!best || d < best.km) best = { zone: z.key, km: +d.toFixed(1) }
  }
  return best
}
