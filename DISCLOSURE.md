# HomeMatch — Phase 0 disclosure

Per the build standard "disclose limitations at delivery" (§2.6, §11). What is
real, what is stubbed, and what is assumed. Known-broken-but-bounded beats
silently wrong.

## What Phase 0 delivers (real, tested — 35 passing tests)

- **Seed directory** — the Phase 0 product: browsable, filterable worker
  directory + profile pages, server-rendered, bilingual TH/EN, mobile-first,
  useful at ~10 workers with no booking flow (§7.1). Verified in-browser.
- **White-label core** — one deployment, many tenants keyed by hostname; theme
  from tenant config; **theme contrast is enforced numerically (≥7:1 AAA)** —
  a failing theme cannot ship. Cross-tenant isolation is tested on *every*
  `operator_id` table (the test discovers them from the live schema).
- **Taxonomy as data** with the **title guard** (§5): a licensed category (e.g.
  nurse) requires a licence number server-side; free text can't bypass it.
- **i18n** fully externalized; the TH pack is proven complete against the EN
  key schema by test; a rendered-page test asserts no untranslated key leaks in
  either locale. A third language is an additive file.
- **Auth** — signed httpOnly session cookies (forgery-rejecting) + phone OTP
  (T0) with expiry + attempt cap, all tenant-scoped; roles + admin gate.
- **Verification T1** with **PDPA data-minimization**: only the assertion
  ("verified against Thai ID/passport, name matched") + a per-operator salted
  hash are stored; a test proves the raw ID number never persists and the
  document is flagged for purge.
- **Contact-withholding invariant** (§6): a test renders profile/directory
  pages for a worker whose record carries a phone and asserts it never appears
  pre-reveal.

## Stubbed / not wired (Phase 0 boundaries — intentional)

- **SMS delivery**: `createOtp` returns the code for a sender to deliver; no SMS
  provider is integrated. In dev the code is available in the return value; in
  production wire an SMS gateway before OTP is user-facing.
- **R2 object storage**: photo/document keys and the purge instruction are
  modelled, but no R2 client runs locally. `recordVerification` returns
  `{ purge: { r2Key } }`; the caller must delete it in production.
- **The message-body redaction pass** (phone/LINE pattern scrub) is a **Phase 1**
  item — Phase 0 has no threads, so there is nothing to redact yet. When built,
  it ships with the debug/dump flag the spec requires (§6, §11.5). Disclosed
  honestly: a determined pair routes around any redaction; we don't fight it,
  we just don't subsidize it pre-match (§8).
- **Offer state machine, contracts, reviews, fee model, LINE notifications** are
  Phases 1–3, not built here.
- **Deployment**: `wrangler.toml` + `src/worker.mjs` are ready but deploying
  needs your Cloudflare account — create the D1 database, paste its id, set
  `SESSION_SECRET`, and apply migrations. The dev server (`npm run serve`) runs
  the identical app on `node:sqlite` with zero cloud dependency.

## Assumptions (my reasoning, not tested fact)

- **Fee default = mode A, customer-pays** (§8). This is a judgement about where
  the surplus sits in an expat-heavy Chiang Mai market, not a measured result.
  The fee model is deferred to Phase 3 and built to be operator-switchable.
- **Contact reveal = on offer acceptance** (§13.3 default).

## Legal — verified this session, still needs a Thai lawyer's sign-off (§12)

- **Domestic-worker floors: the spec's "Ministerial Regulation No. 14" is
  superseded.** Web-verified (2026-07-13): **MR No. 15 (B.E. 2567), in force
  30 Apr 2024** replaced MR14 and changed the floors — **minimum wage now applies
  to domestic workers** (Chiang Mai 380฿/day Mueang, 357฿ elsewhere; rates of
  1 Jul 2025), plus an 8h/day cap, 98-day maternity (45 paid), 3 days business
  leave. Severance + statutory OT rates still excluded. The full sourced record
  is `../baanstaff/docs/LEGAL_RESEARCH.md`. **When the Phase 2 contract template
  is built, its constants must target MR15**, and the `LEGAL-REVIEW-PENDING`
  marker points here.
- **Agency licensing (Employment Arrangement Act B.E. 2528)**: whether a
  no-placement-fee listings platform sits outside the licensed-recruitment
  regime is the threshold question (§12.1). Get a Thai lawyer's read before
  monetizing; the fee-mode switch exists so the answer is a config change.
- **PDPA**: the verify-then-purge pattern is built; a per-tenant privacy policy
  + consent flow still needs to ship before public launch.
