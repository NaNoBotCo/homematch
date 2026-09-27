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
  it ships with the debug/dump flag the spec requires (§6, §11.5). A
  determined pair routes around any redaction; the design does not fight it or
  subsidize it pre-match (§8).
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

## Self-listing (added 2026-09-27, live at motdang.net/home-help)

- **What it is**: workers list themselves at `/join`; the listing waits as
  `pending` until the operator approves it at `/admin` (HTTP Basic, password =
  the `ADMIN_KEY` secret). Readers contact the worker by the LINE ID or phone
  the worker typed — the tenant's `contactRevealPolicy` is `public`. No
  offers, no relay, no fee, no document handling.
- **Private edit link**: shown once after sending; only its sha256 is stored.
  Changing the name or contact on a live listing sends it back to `pending`.
  "Remove my listing" deletes the rows.
- **Guards**: consent checkbox; a hidden honeypot field; cross-site POSTs are
  refused; five sends per connection per 24 h (the connection is stored as a
  salted hash). Profiles carry `noindex` unless the worker ticks the box.
- **Alerts**: a new or re-reviewed listing mails `ALERT_TO` through Resend when
  `RESEND_KEY` is set.
- **Tiers and reply times are off** on this tenant (`showTiers`, `showReply`
  false): nothing is verified and nothing is relayed, so there is no tier or
  reply time to show.
- **Agency licensing**: this is the listings-board shape
  (`../baanstaff/docs/LEGAL_RESEARCH.md` §4 point 2). Matching, recommending,
  negotiating for either side, or holding worker documents are the features
  §4 point 3 lists as licensable territory; none of them runs on this tenant.

## The approval bot, photos, the digest (added 2026-09-27)

- **Listings** are approved by `src/lib/screen.mjs` on tenants with
  `autoApprove`. Rules first (sex-work and scam words, agency signals, links,
  markup, instruction-shaped text, hidden characters, business names, rate
  outliers, non-Thai phones, a contact already on another listing, three or
  more listings from one connection in a day, a sexual photo from the same
  connection in 7 days). Then Llama Guard 3 on Workers AI, which can only turn
  an approve into a hold. A hold waits for the operator; the sender is not
  told why. Every edit is screened again.
- **Photos** (`src/lib/photos.mjs`, tenant `photos`): JPEG or PNG by bytes, 4
  MB, 4 per listing. EXIF, XMP, IPTC, comments and PNG text chunks are
  stripped before storage. Mistral Small 3.1 answers two questions per photo —
  a JSON classification and a head count. Any person, child, nudity or sexual
  content refuses the photo, and the code drops it before the storage call; nudity also sends the
  listing back to waiting and holds that connection's next listings for 7
  days. An unreadable answer or a model error refuses. Text or a QR code
  holds the photo for the operator. The browser redraws photos at 1600 px
  before upload when JavaScript runs.
- **What the checks are not**: word lists and a model are a filter, not a
  guarantee. A determined sender can word around the rules; the model can
  miss. The digest, the report link on each page and the operator's take-down
  are the backstop.
- **Digest** (`src/digest.mjs`): daily at 08:00 Bangkok, and between those
  when something is held or refused or the form or admin page is probed, at
  most every two hours. Plain text to `ALERT_TO`; strangers' text quoted,
  cut, never in the subject. `/admin/digest` previews it.

## What photos say about themselves (added 2026-09-27, her word)

- **Kept, privately**: the raw EXIF block of each stored photo goes to
  `meta/` in the bucket; GPS, altitude, the camera's time and the device go on
  the row. When the browser redraws a photo it sends the EXIF block beside it.
  The public copy carries none of it.
- **Read**: a third question to the vision model transcribes signs, shop
  names, places, phone numbers, LINE IDs, web addresses and QR codes. Kept on
  the row, run through the word rules, compared with the listing's own
  contact.
- **Gleaned**: nearest zone and distance; distance from the areas the worker
  chose; another listing's photo within 150 m; a camera time over two years
  old; no location; another phone or LINE ID, a web address or a QR code in
  the picture. The writing flags hold the photo; the others go to the admin
  page and the digest.
- **Limits**: phone browsers' photo pickers often remove GPS before upload,
  so many photos arrive with a date and a camera but no place. Metadata and
  signs are claims the file makes; anyone can edit them.
