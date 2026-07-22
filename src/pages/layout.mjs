// layout.mjs — the page shell. Injects the tenant theme as CSS custom
// properties (white-label), sets lang, renders header/nav/footer. Accessibility
// is structural (§2.1): skip link, ≥44px targets, focus-visible outlines,
// 200%-zoom safe, colour never the sole signal. "Wikipedia-dark-mode plainness."
import { html, raw } from '../lib/html.mjs'

const BASE_CSS = `
:root{--bg:#100f0b;--text:#f0ece2;--accent:#e2a63d;--muted:#a89c84;--card:#181611;--border:#312a1c}
*{box-sizing:border-box}
html{font-size:17px;color-scheme:dark}
body{margin:0;background:var(--bg);color:var(--text);
  font-family:'Noto Sans Thai Looped','Noto Sans Thai',-apple-system,Segoe UI,sans-serif;line-height:1.55}
a{color:var(--accent)}
.skip{position:absolute;left:-999px}.skip:focus{left:8px;top:8px;background:var(--card);padding:8px;z-index:10}
:focus-visible{outline:3px solid var(--accent);outline-offset:2px}
.wrap{max-width:56rem;margin:0 auto;padding:0 1rem}
header.site{display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:.75rem 0;border-bottom:1px solid var(--border)}
header.site .brand{font-weight:700;color:var(--accent);text-decoration:none;font-size:1.15rem}
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
`

/** Render a full HTML document. `ctx` = { config, t, locale, path }. */
export function page(ctx, { title, body, city }) {
  const { config, t, locale } = ctx
  const th = config.theme
  const themeVars = `--bg:${th.bg};--text:${th.text};--accent:${th.accent};` +
    `--muted:${th.muted || th.text};--card:${th.card || th.bg};--border:${th.border || th.muted || th.text}`
  const other = (config.locales || ['th', 'en']).find((l) => l !== locale) || 'en'
  const qsToggle = toggleLocaleHref(ctx.path, ctx.query, other)
  return raw('<!doctype html>' + html`
<html lang="${locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title ? title + ' · ' : ''}${config.brandName}</title>
<style>${raw(BASE_CSS)}</style>
<style>:root{${raw(themeVars)}}</style>
</head>
<body>
<a class="skip" href="#main">${locale === 'th' ? 'ข้ามไปเนื้อหา' : 'Skip to content'}</a>
<div class="wrap">
<header class="site">
  <a class="brand" href="/">${config.brandName}</a>
  <nav class="site" aria-label="${locale === 'th' ? 'เมนูหลัก' : 'Primary'}">
    <a class="btn ${ctx.path === '/' ? 'on' : ''}" href="/"${ctx.path === '/' ? raw(' aria-current="page"') : ''}>${t('nav.directory')}</a>
    <a class="btn ${ctx.path === '/how' ? 'on' : ''}" href="/how"${ctx.path === '/how' ? raw(' aria-current="page"') : ''}>${t('page.how.title')}</a>
    <a class="btn" href="${qsToggle}" rel="nofollow">${other === 'th' ? 'ไทย' : other.toUpperCase()}</a>
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
