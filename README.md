# HomeMatch

White-label household-services matchmaking platform. Negotiation-first,
thin-market-viable, disintermediation-tolerant, white-label from day one. See
the driver document for the full spec; this repo is **Phase 0 — the seed
directory** (ships value at ~10 workers).

## Stack

Cloudflare Pages/Workers + D1 (SQLite) + Hono, server-rendered HTML, no SPA.
The same `src/app.mjs` runs two ways:

- **Production**: `src/worker.mjs` binds the app to D1 (`wrangler.toml`).
- **Local/dev + tests**: `node:sqlite` (Node's built-in — zero native deps),
  bridged to the app in `scripts/dev-server.mjs`.

Only runtime dependency is Hono; jsdom + wrangler are dev-only.

## Run it

```bash
npm install
npm run seed     # create .data/homematch.sqlite with 12 demo workers
npm run serve    # http://localhost:4310  (dev tenant answers on 'localhost')
npm test         # 35 tests (schema, tenant isolation, contrast, i18n, auth,
                 #  directory filters, verification, a11y, contact-withholding)
```

`npm run dev` uses `wrangler pages dev` against D1 (needs the Cloudflare
toolchain + a local D1 binding).

## Layout

```
migrations/       numbered schema (applies from zero; tested per-state)
tenants/*.json    per-operator config (brand, theme, taxonomy, zones, fee, legal)
src/
  db.mjs          async adapter — node:sqlite (dev) OR D1 (prod)
  migrate.mjs     migration runner
  app.mjs         Hono app (tenant middleware, routes) — portable
  worker.mjs      Cloudflare entry (D1)
  repo.mjs        tenant-scoped data access (every query carries operator_id)
  i18n/           en (key schema) + th packs, override-able per operator
  lib/            contrast, tenant, taxonomy (title guard), auth, verify, html
  pages/          layout + directory + profile + components (server render)
scripts/          dev-server, seed
test/             behavioural suites (§11)
```

## White-label

A new operator = one `tenants/<id>.json` + an `operator` row. Everything
city-specific (brand, theme colours, enabled categories, zones, fee model,
legal footer, locales) lives there. Theme colours are **contrast-checked
numerically at load** — an unreadable theme cannot ship (`test/tenant.test.mjs`).

## Status & limits

Phase 0 complete and browser-verified. See **DISCLOSURE.md** for exactly what is
stubbed (SMS, R2, Phase 1+ features), the fee-default assumption, and the legal
flags — notably that the domestic-worker floor is **Ministerial Regulation
No. 15 (2024)**, not the spec's MR14 (research in `../baanstaff/docs/LEGAL_RESEARCH.md`).

Phases 1–4 (negotiation + offers, contracts + reviews, fee model + LINE +
second-tenant proof, escrow/background-checks) are not built here.


## Licence

Records, prose and pages: CC BY-SA 4.0. Code: AGPL-3.0-or-later. Anything
carried in from elsewhere keeps its own terms — see [LICENSE](LICENSE) and [NOTICE.txt](NOTICE.txt).

**Commercial licence.** If share-alike doesn't fit your use — a corpus, a
product, a model — a commercial licence is available.
[Open an issue](https://github.com/NaNoBotCo/homematch/issues) and say what you need.

---

Contact: Nan · nan@motdang.net · Sponsor: [Ko-fi](https://ko-fi.com/defiantchiangmai) · [Patreon](https://www.patreon.com/nanobotco)
