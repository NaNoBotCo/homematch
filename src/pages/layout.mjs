// layout.mjs — the page shell. Injects the tenant theme as CSS custom
// properties (white-label), sets lang, renders header/nav/footer. Accessibility
// is structural (§2.1): skip link, ≥44px targets, focus-visible outlines,
// 200%-zoom safe, colour never the sole signal. "Wikipedia-dark-mode plainness."
import { html, raw } from '../lib/html.mjs'

const BASE_CSS = `
:root{--bg:#100f0b;--text:#f0ece2;--accent:#e2a63d;--muted:#a89c84;--card:#181611;--border:#312a1c}
*{box-sizing:border-box}
html{font-size:17px}
body{margin:0;background:var(--bg);color:var(--text);
  font-family:'Noto Sans Thai Looped','Noto Sans Thai',-apple-system,Segoe UI,sans-serif;line-height:1.55}
a{color:var(--accent)}
.skip{position:absolute;left:-999px}.skip:focus{left:8px;top:8px;background:var(--card);padding:8px;z-index:10}
:focus-visible{outline:3px solid var(--accent);outline-offset:2px}
.wrap{max-width:56rem;margin:0 auto;padding:0 1rem}
header.site{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:1rem;padding:.75rem 0;border-bottom:1px solid var(--border)}
header.site .brand{white-space:nowrap;font-weight:700;color:var(--accent);text-decoration:none;font-size:1.15rem}
nav.site{display:flex;gap:.25rem;flex-wrap:wrap}
.btn,button.btn{display:inline-flex;align-items:center;justify-content:center;min-height:44px;min-width:44px;
  padding:.5rem .9rem;border:1px solid var(--border);border-radius:.6rem;background:var(--card);color:var(--text);
  text-decoration:none;font:inherit;cursor:pointer}
.btn[aria-current="page"],.btn.on{border-color:var(--accent);color:var(--accent)}
.btn:active{transform:translateY(1px)}
footer.site{margin-top:2rem;padding:1.25rem 0;border-top:1px solid var(--border);color:var(--muted);font-size:.85rem}
main{padding:1rem 0 2rem}
h1{font-size:1.5rem;margin:.5rem 0 1rem}
.muted{color:var(--muted)}
@media (max-width:480px){nav.site{width:100%;justify-content:flex-start}}
.lede{margin:-.5rem 0 1rem}
.cta{display:flex;flex-wrap:wrap;gap:.5rem;margin:.75rem 0 1rem}
.btn.primary{background:var(--accent);border-color:var(--accent);color:var(--bg);font-weight:700}
form.listing fieldset{border:1px solid var(--border);border-radius:.75rem;margin:0 0 1rem;padding:.75rem .9rem}
form.listing legend{font-weight:700;padding:0 .3rem}
form.listing .hint{color:var(--muted);font-size:.88rem;margin:.1rem 0 .5rem}
form.listing .field{margin:0 0 .9rem}
form.listing .field>label{display:block;font-weight:700;margin-bottom:.25rem}
form.listing input[type=text],form.listing input[type=tel],form.listing input[type=number],form.listing select,form.listing textarea{
  width:100%;max-width:28rem;min-height:44px;padding:.5rem .6rem;border:1px solid var(--border);border-radius:.5rem;
  background:var(--card);color:var(--text);font:inherit}
form.listing textarea{min-height:6rem}
form.listing input[type=file]{display:block;width:100%;max-width:28rem;min-height:44px;padding:.5rem;border:1px dashed var(--border);
  border-radius:.5rem;background:var(--card);color:var(--text);font:inherit}
form.listing input[type=file]::file-selector-button{min-height:36px;margin-right:.6rem;padding:.3rem .8rem;border:1px solid var(--accent);
  border-radius:.5rem;background:var(--accent);color:var(--bg);font:inherit;font-weight:700;cursor:pointer}
form.listing .checks{display:flex;flex-wrap:wrap;gap:.35rem}
form.listing .check{display:inline-flex;align-items:center;gap:.45rem;min-height:44px;padding:.3rem .7rem;
  border:1px solid var(--border);border-radius:.6rem;background:var(--card);cursor:pointer}
form.listing .check input{width:1.2rem;height:1.2rem;margin:0}
form.listing .inline{display:flex;flex-wrap:wrap;gap:.5rem;align-items:end}
form.listing .inline .field{margin:0}
form.listing .hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}
[aria-invalid="true"]{border:2px solid var(--accent)!important}
.errors{border:2px solid var(--accent);border-radius:.75rem;padding:.6rem .9rem;margin:0 0 1rem}
.errors ul{margin:.3rem 0 0;padding-left:1.2rem}
.notice{border:1px solid var(--border);border-radius:.75rem;background:var(--card);padding:.75rem .9rem;margin:0 0 1rem}
.secret{word-break:break-all;font-family:ui-monospace,Menlo,monospace;font-size:.9rem;background:var(--bg);
  border:1px dashed var(--border);border-radius:.5rem;padding:.5rem .6rem;display:block;margin:.4rem 0}
.contact{display:flex;flex-wrap:wrap;gap:.5rem;margin:.5rem 0}
table.adm{border-collapse:collapse;width:100%;font-size:.9rem}
table.adm td,table.adm th{border-bottom:1px solid var(--border);padding:.4rem;text-align:left;vertical-align:top}
.adm form{display:inline}
.gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(14rem,1fr));gap:.5rem;margin:.5rem 0}
.gallery img{width:100%;height:auto;border-radius:.6rem;border:1px solid var(--border);background:var(--card)}
.thumbs{display:flex;flex-wrap:wrap;gap:.6rem;margin:.4rem 0}
.thumb{display:flex;flex-direction:column;gap:.3rem;max-width:11rem}
.thumb img{width:100%;height:auto;border-radius:.5rem;border:1px solid var(--border)}
`

/** Render a full HTML document. `ctx` = { config, t, locale, path, base }.
 *  `robots` sets the robots meta (e.g. 'noindex'); `canonical` is a path under
 *  the base; `description` fills the meta description and og:description. */
export function page(ctx, { title, body, robots, canonical, description }) {
  const { config, t, locale } = ctx
  const base = ctx.base || ''
  const th = config.theme
  const themeVars = `--bg:${th.bg};--text:${th.text};--accent:${th.accent};` +
    `--muted:${th.muted || th.text};--card:${th.card || th.bg};--border:${th.border || th.muted || th.text}`
  const other = (config.locales || ['th', 'en']).find((l) => l !== locale) || 'en'
  const qsToggle = base + toggleLocaleHref(ctx.path, ctx.query, other)
  const origin = config.hostname ? `https://${config.hostname}` : ''
  const canon = canonical != null && origin ? origin + base + canonical : null
  const fullTitle = (title ? title + ' · ' : '') + config.brandName
  const scheme = config.colorScheme === 'light' ? 'light' : 'dark'
  const navLink = (href, label, here) => html`<a class="btn ${here ? 'on' : ''}" href="${base + href}"${here ? raw(' aria-current="page"') : ''}>${label}</a>`
  return raw('<!doctype html>' + html`
<html lang="${locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${fullTitle}</title>
${description ? html`<meta name="description" content="${description}">` : ''}
${robots ? html`<meta name="robots" content="${robots}">` : ''}
${canon ? html`<link rel="canonical" href="${canon}">` : ''}
<meta property="og:title" content="${fullTitle}">
${description ? html`<meta property="og:description" content="${description}">` : ''}
${config.ogImage ? html`<meta property="og:image" content="${config.ogImage}"><meta name="twitter:card" content="summary_large_image">` : ''}
${canon ? html`<meta property="og:url" content="${canon}">` : ''}
<meta name="color-scheme" content="${scheme}">
<style>${raw(BASE_CSS)}</style>
<style>:root{${raw(themeVars)};color-scheme:${raw(scheme)}}</style>
</head>
<body>
<a class="skip" href="#main">${locale === 'th' ? 'ข้ามไปเนื้อหา' : 'Skip to content'}</a>
<div class="wrap">
<header class="site">
  <a class="brand" href="${config.homeUrl || base + '/'}">${config.brandName}</a>
  <nav class="site" aria-label="${locale === 'th' ? 'เมนูหลัก' : 'Primary'}">
    ${navLink('/', t('nav.directory'), ctx.path === '/')}
    ${config.selfListing ? navLink('/join', t('nav.join'), ctx.path === '/join') : ''}
    ${navLink('/how', t('page.how.title'), ctx.path === '/how')}
    <a class="btn" href="${qsToggle}" rel="nofollow" lang="${other}">${other === 'th' ? 'ไทย' : other.toUpperCase()}</a>
  </nav>
</header>
<main id="main">
${body}
</main>
<footer class="site">
  <p>${(config.legalFooter && config.legalFooter[locale]) || t('legal.notEmployer')}</p>
</footer>
</div>
</body>
</html>`)
}

function toggleLocaleHref(path, query, locale) {
  const q = new URLSearchParams(query || {})
  q.set('lang', locale)
  return `${path}?${q.toString()}`
}
