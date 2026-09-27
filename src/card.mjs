// card.mjs — a share card for each listing: 1200×630, the picture LINE and
// Facebook show when someone forwards the page. Background (the first work
// photo, or Mot Dang paper), scrim, spacer, text: the name, the work in Thai
// and English, the areas, and the board's address.
//
// Workers cannot shape Thai text, so the card is drawn by Cloudflare's
// headless Chrome (Browser Rendering, binding BROWSER) with Sarabun embedded,
// stored in R2 under cards/<id>/<hash>.png, and served from there. The hash
// covers everything drawn, so an edit makes a new card and the old one goes.
import { html, raw } from './lib/html.mjs'
import { createHash } from 'node:crypto'
import { SARABUN_600_THAI, SARABUN_600_LATIN, SARABUN_400_THAI, SARABUN_400_LATIN } from './fonts.mjs'

const FACE = (weight, b64, range) =>
  `@font-face{font-family:S;font-weight:${weight};src:url(data:font/woff2;base64,${b64}) format('woff2');unicode-range:${range}}`
const THAI = 'U+0E01-0E5B,U+200C-200D,U+25CC'
const LATIN = 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD'
const FONTS = FACE(600, SARABUN_600_THAI, THAI) + FACE(600, SARABUN_600_LATIN, LATIN) +
  FACE(400, SARABUN_400_THAI, THAI) + FACE(400, SARABUN_400_LATIN, LATIN)

/** Everything the card draws, in a stable order. */
export function cardFacts(w, tTh, tEn, photoId) {
  return {
    name: w.display_name,
    workTh: w.categories.map((k) => tTh('cat.' + k)),
    workEn: w.categories.map((k) => tEn('cat.' + k).split(' · ')[0]),
    areas: w.zones.map((k) => tTh('zone.' + k)),
    photo: photoId || null,
  }
}

export const cardHash = (facts) =>
  createHash('sha256').update(JSON.stringify(facts)).digest('hex').slice(0, 16)

/** The card as a self-contained HTML page (no network). `photoUrl` is a
 *  data: URL or null. */
export function cardHtml(facts, photoUrl, { site = 'motdang.net/home-help' } = {}) {
  const bg = photoUrl
    ? html`<img class="bg" src="${photoUrl}" alt=""><div class="scrim"></div>`
    : html`<div class="paper"></div>`
  const dark = !!photoUrl
  return '<!doctype html>' + html`<html lang="th"><head><meta charset="utf-8"><style>${raw(FONTS)}
*{margin:0;box-sizing:border-box}
html,body{width:1200px;height:630px;overflow:hidden}
body{position:relative;font-family:S,sans-serif;color:${raw(dark ? '#fffaf0' : '#2a1e16')}}
.bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.scrim{position:absolute;inset:0;background:linear-gradient(180deg,rgba(20,12,8,.10) 0%,rgba(20,12,8,.35) 40%,rgba(20,12,8,.86) 100%)}
.paper{position:absolute;inset:0;background:#faf5ea;border:18px solid #8f2a21}
.text{position:absolute;left:64px;right:64px;bottom:56px;display:flex;flex-direction:column;gap:14px}
.spacer{flex:1}
.name{font-weight:600;font-size:92px;line-height:1.15;${raw(dark ? 'text-shadow:0 2px 12px rgba(0,0,0,.45);' : 'color:#8f2a21;')}
  overflow:hidden;display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical}
.work{font-weight:600;font-size:44px;line-height:1.3}
.en{font-weight:400;font-size:30px;opacity:.9}
.areas{font-weight:400;font-size:32px;opacity:.95}
.brand{display:flex;justify-content:space-between;align-items:baseline;margin-top:10px;font-size:28px;font-weight:600;
  border-top:2px solid ${raw(dark ? 'rgba(255,250,240,.5)' : '#c4b28d')};padding-top:14px}
.ant{color:${raw(dark ? '#ffd6cf' : '#8f2a21')}}
</style></head><body>
${bg}
<div class="text">
  <div class="name">${facts.name}</div>
  <div class="work">${facts.workTh.join(' · ')}</div>
  <div class="en">${facts.workEn.join(' · ')}</div>
  <div class="areas">${facts.areas.join(' · ')}</div>
  <div class="brand"><span class="ant">มดแดง Mot Dang</span><span>${site}</span></div>
</div>
</body></html>`.toString()
}

/** Draw a card with Browser Rendering, trying twice (the first launch after
 *  a quiet spell can fail). Returns PNG bytes, or throws. */
export async function drawCard(browserBinding, pageHtml) {
  try { return await drawOnce(browserBinding, pageHtml) } catch { return await drawOnce(browserBinding, pageHtml) }
}

async function drawOnce(browserBinding, pageHtml) {
  const { default: puppeteer } = await import('@cloudflare/puppeteer')
  const browser = await puppeteer.launch(browserBinding)
  try {
    const page = await browser.newPage()
    await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 })
    await page.setContent(pageHtml, { waitUntil: 'load' })
    await page.evaluate(() => document.fonts.ready)
    return await page.screenshot({ type: 'png' })
  } finally {
    await browser.close()
  }
}
