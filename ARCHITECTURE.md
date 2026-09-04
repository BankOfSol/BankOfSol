# Bank of Sol — Architecture (living map)

The always-current picture of bankofsol.app. **Any change that adds/renames/removes a
route, table, column, binding, env var, R2 convention, auth rule, or deploy step must
edit this file in the same commit** — a change that isn't recorded here is a change the
next session has to rediscover. (Discipline inherited from PoundPlay, which proved it.)

## 1 · Stack & deploy model

- **One real Worker** `bankofsol` serving everything: React 18 + Vite SPA (`src/` →
  `dist/`) as static assets, plus the `/api/*` backend — Pages-Functions-style files in
  `functions/api/*` compiled by `wrangler pages functions build --outdir=./dist/_worker.js/`
  (see `package.json` build). Bindings live in `wrangler.jsonc`, NOT a dashboard.
- **Deploys are explicit**: `npm run deploy` (build + `wrangler deploy`). `git push` is
  backup, not release. The mailer Worker deploys separately: `npm run deploy:mailer` —
  required whenever `workers/mailer/*` or anything it imports
  (`functions/lib/email.js`, `functions/lib/digest.js`) changes. **Deploy the mailer
  first on a fresh account** — the main Worker's `EMAIL` service binding needs its
  target to exist.
- ⚠️ **`public/.assetsignore` (contents: `_worker.js`) is load-bearing.** The build
  writes compiled server code to `dist/_worker.js`, and `dist/` is also the static
  asset directory — without that ignore file wrangler refuses to deploy (correctly:
  it would publish server code to the internet). Vite copies it from `public/` on
  every build, so it survives `rm -rf dist`. Never delete it.
- **Domains**: `bankofsol.app`, `www.`, `shop.` — all `custom_domain` routes on the one
  Worker (created on deploy; the zone must exist in the account first). The SPA is
  host-aware (`src/lib/host.js`), and **the shop is a STANDALONE storefront**
  (2026-08-08): shop.bankofsol.app serves ONLY the store (`/` + `/shop/:id`; its own
  minimal chrome; any other path client-redirects to the apex), the main site
  doesn't feature the shop anywhere (no nav/home links; `/shop*` on the apex
  client-forwards to the subdomain), and only local dev — which has no subdomains —
  renders the shop inline at `/shop`. Admin manages it at
  `shop.bankofsol.app/?view=manage` (the cross-subdomain session carries).
- **Local dev**: `npm run cf:dev` (build + `wrangler dev`, port 8788) with `.dev.vars`
  (copy from `.dev.vars.example`). UI-only HMR: `npm run dev` (:5173, proxies /api).
- **Starter content**: `scripts/seed-starter.sql` (`npm run db:seed` /
  `db:seed:remote`) ships the launch samples — Mon–Fri 10:00–16:00 availability, the
  Intro call ($50/30m) + Working session ($150/60m) services, and the Bank of Sol Shop
  with the Sol Sun Desk Stand ($24). Fully idempotent (guarded by natural keys); the
  shop rows resolve their owner from ADMIN_EMAIL's user, so run it after first signup.
  ⚠️ `wrangler dev` serves the BUILT worker — server-code edits need `npm run build`
  (wrangler dev hot-reloads the rebuilt file). ⚠️ wrangler dev addresses requests as
  `http://bankofsol.app` (it simulates the first route) — `functions/lib/auth.js`
  trusts that shape in dev only.

## 2 · Bindings & env

Account: `Kaasi.serrano@gmail.com's Account` (`568986ebd89d7e53c2666c4dd94b676b`).

| Binding | Type | Target | Notes |
|---|---|---|---|
| `DB` | D1 | `bankofsol` | `716caa51-02da-4005-b765-1f283fa9f0bb` (same id in both wrangler configs) |
| `BUCKET` | R2 | `bankofsol-uploads` | uploads via `/api/upload`, served via `/api/files/<key>` — never a public bucket URL |
| `EMAIL` | service | `bankofsol-mailer` | in the mailer itself, `EMAIL` is the real `send_email` binding — same call shape (`env.EMAIL.send({...})`) both places |
| `ASSETS` | assets | `./dist` | `run_worker_first: ["/api/*"]`, SPA fallback |

Vars (wrangler.jsonc): `BETTER_AUTH_URL`, `ADMIN_EMAIL`, `APP_ORIGINS`, `MAIL_FROM`,
`MAIL_FROM_NAME`, `SOLRAY_NOTIFY_EMAIL` (where Sol & Ray pilot requests are sent;
falls back to `ADMIN_EMAIL`).

Vars (wrangler.jsonc): `BETTER_AUTH_URL`, `ADMIN_EMAIL` (= superadmin), `APP_ORIGINS`
(comma-separated extra trusted origins), `MAIL_FROM`, `MAIL_FROM_NAME`.
Secrets (`wrangler secret put`): `BETTER_AUTH_SECRET`, `STRIPE_SECRET_KEY`,
`STRIPE_WEBHOOK_SECRET`; Phase 2 `SLANT3D_API_KEY`; Phase 3 `SOLANA_RPC_URL` (+ vars
`SOLANA_NETWORK`, `USDC_MINT`).

**The mailer Worker** (`workers/mailer/`): owns `send_email` (allowed sender
`sol@bankofsol.app`) and ALL cron triggers (the compiled main Worker only exports
`fetch`). Cron `0 16 * * *` (8am PT) → `functions/lib/digest.js` `runDailyCron`:
stale-pending sweep (>24h), booking reminders (next 26h, unreminded), daily digest to
ADMIN_EMAIL (paid orders / bookings / custody applications; silent when empty).

## 3 · Data model (D1 `bankofsol`, migrations/ numbered SQL)

- **0001** Better Auth core (`user` + `isAdmin`/`isSuperAdmin`, `session`, `account`
  with timestamp defaults, `verification`) + `admin_activity` + `email_log`
  (subjects + outcomes ONLY — never bodies/URLs/tokens).
- **0002 shop**: `shop` (single active row v1, keyed `ownerUserId`), `product`
  (priceCents INTEGER, images JSON, colors JSON, modelUrl .3mf/.glb, status
  draft|published|soldout|archived|hidden), `shop_order` (guest-capable:
  `buyerEmail/Name/Ip` snapshots, refCode `BOS-XXXXXX` UNIQUE, status CHECK already
  includes Phase-2 `fulfilling` — CHECK edits are table rebuilds, so it shipped
  complete).
- **0003 booking**: `consult_service` (durationMin/priceCents/slotEveryMin/bufferMin/
  leadHours/maxDaysAhead), `availability_rule` (weekly wall-clock America/Los_Angeles),
  `availability_exception` (closed = whole-day blackout, open = extra window),
  `booking` (UTC instants, `buyerTz` for rendering, `icsToken` UNIQUE = calendar/cancel
  key, `reminderSentAt`).
- **0004 custody waitlist** (renamed by 0005): userId UNIQUE, status
  applied|approved|rejected|suspended|closed, decidedBy/At.
- **0005 member ledger (the pivot)**: `custody_account` → **`member_account`** (same
  lifecycle, honest name). New: `ledger_entry` (**signed** amountCents — + member
  owes, − credit; balance = SUM; kinds invoice|payment|loan_disbursement|loan_due
  (amount-0 monthly marker)|loan_payment|adjustment|refund), `invoice` +
  `invoice_item` (draft→open posts the ledger charge; only drafts editable; void
  books a reversing adjustment), `loan` (disbursement posts +principal; monthly
  dueDay 1–28 tracked by the daily cron with amount-0 markers + emails; forgiven
  books off the remainder), `payment_claim` (crypto intents — the ledger only moves
  when Sol CONFIRMS a claim with its USD value), `crypto_rail` (XRP/SOL/BTC/TON
  RECEIVING addresses, superadmin-only, public addresses ever), `engagement`
  (onboarding pipeline), `review` (one per completed booking).

- **0006 solray_lead**: Sol & Ray pilot requests from the landing page (name, title,
  org, email, phone, volume, message, source, ip for the per-IP cap; status
  new|contacted|pilot|closed; adminNote). No auth, no money — a plain lead queue.

Money is integer cents everywhere; `parseFloat` is banned in money files. Slots are
computed on request, never materialized; the atomic primitive is the guarded
`INSERT ... SELECT ... WHERE NOT EXISTS(overlap)` in `functions/lib/booking.js`
(D1 has no transactions).

## 4 · API routes (gate → purpose)

Auth: `/api/auth/[[route]]` (Better Auth 1.6.23 — pinned; email+password, HARD
verification gate, no session until verified). `/api/me` public session snapshot.
Gates live in `functions/lib/util.js` (`requireUser/VerifiedUser/Admin/SuperAdmin/
CustodyClient` returning `{user}|{error}`) — every route calls its gate explicitly, no
middleware. Admin mutations all `logAdminActivity`.

| Route | Gate | Purpose |
|---|---|---|
| POST `/api/upload` | user (3D files: admin) | R2 upload; images 25MB, .3mf/.glb 8MB, .stl 50MB |
| GET `/api/files/[key]` | public | immutable R2 read-through (no Range handling on purpose) |
| POST `/api/stripe/webhook` | HMAC | ONE webhook; dispatch on `metadata.kind` HANDLERS map: `bos_shop`, `bos_booking` |
| GET `/api/shop` · `/api/shop/products/[id]` | public | storefront / product detail (admins see drafts; 404 not 403) |
| POST `/api/shop/checkout` | public+caps | pending order → Stripe session (guest ok; price from DB only; 503-not-502 on Stripe failure) |
| POST `/api/shop/confirm` | public (cs_ id is auth) | webhook fallback; COALESCE discipline vs the race |
| GET `/api/shop/orders` | user | my orders |
| `/api/admin/shop{,/products,/orders}` | admin | shop upsert (bootstrap), product CRUD (delete 409s with orders), order transitions (ORDER_TRANSITIONS) |
| GET `/api/booking/services` · `/slots` | public | active services / computed open slots (bare UTC instants) |
| POST `/api/booking/checkout` | public+caps | server re-derives slot validity, guarded INSERT claims it, Stripe session (kind bos_booking) |
| POST `/api/booking/confirm` | public | fallback; emails fire from whichever of webhook/confirm flips the row |
| POST `/api/booking/cancel` | icsToken or owner | ≥24h → auto full refund (`CANCEL_CUTOFF_HOURS`); inside → 409 "reply to email" |
| GET `/api/booking/ics/[token]` | unguessable token | hand-written RFC 5545 VEVENT (paid/completed only) |
| GET `/api/booking/mine` | user | my bookings (includes icsToken — caller's own) |
| `/api/admin/booking/{services,availability,list,action}` | admin | service CRUD, rules+exceptions editor, list, complete/cancel(+refund)/meeting-link |
| POST `/api/membership/apply` | verified user | one application per user (UNIQUE); emails confirmation |
| GET `/api/membership/status` | user | drives the locked-overlay progress tracker |
| `/api/admin/membership/{queue,decide}` | admin | FIFO queue; approve/reject/suspend/close (emails on approve/reject) |
| GET `/api/billing` | member | the whole account: balance, itemized ledger, invoices+items, loans, engagements, active rails, reviewable bookings |
| POST `/api/billing/invoices/[id]/pay` | member (owner, 404) | Stripe checkout for the OUTSTANDING amount (kind `bos_invoice`) |
| POST `/api/billing/invoices/[id]/claim` | member (owner) | file a crypto payment claim {chain, txRef}; one pending per invoice |
| POST `/api/billing/confirm` | public (cs_ id) | Stripe fallback; session id is the idempotency key vs the webhook |
| GET/POST `/api/reviews` | user | post-consulting review (own completed bookings, one each) |
| GET `/api/admin/members` · `/[id]` | admin | member list w/ balances/claims badges; full member file |
| POST `/api/admin/members/invoice` | admin | save draft / open (posts ledger) / void (reversing entry) |
| POST `/api/admin/members/payment` | admin | record payment (any method) or signed adjustment (note required) |
| POST `/api/admin/members/loan` | admin | create (disbursement entry) / payment / status (forgiven books off remainder) |
| POST `/api/admin/members/engagement` | admin | onboarding pipeline CRUD |
| GET/POST `/api/admin/members/claims` | admin | pending crypto claims; confirm (with USD value → ledger) / reject |
| GET/POST/DELETE `/api/superadmin/rails` | superadmin | XRP/SOL/BTC/TON receiving addresses (public only, sanitizer refuses key-shaped input) |
| GET `/api/admin/counts` · `/api/admin/email-log` | admin | tab badges (incl. pendingClaims/membershipApplied/solrayLeads); outbound-mail ledger |
| POST `/api/solray/pilot-request` | public+caps | Sol & Ray lead capture: honeypot (`website`), 5/IP/day, length-capped fields → `solray_lead` + two emails (requester confirmation; notice to `SOLRAY_NOTIFY_EMAIL`) |
| GET/POST `/api/admin/solray/leads` | admin | lead queue (?status=); status/adminNote updates (logAdminActivity) |
| `/api/superadmin/{admins,activity}` | superadmin | grant/revoke isAdmin (isSuperAdmin NEVER grantable); audit feed |

## 5 · Auth & roles

Better Auth pinned **1.6.23** (`functions/lib/auth.js` comments encode version-specific
behaviors — re-verify all before bumping). Roles as `additionalFields` with
`input:false` (no self-escalation). Superadmin = `SUPER_ADMIN_EMAIL || ADMIN_EMAIL`,
self-healed into the DB at session time. Cross-subdomain cookies (`.bankofsol.app`)
enabled only in prod (an explicit domain would break localhost). Owner-scoped routes
return 404, not 403. The shop checkout/confirm are deliberately public (guest
checkout) — do NOT "fix" them with requireUser.

## 6 · Email

All outbound goes through `functions/lib/email.js`: never throws, discloses
automation + the not-a-bank line in every footer, and logs every attempt to
`email_log` (subjects + outcomes only). Prod path: site Worker → `EMAIL` service
binding → `bankofsol-mailer` → Email Sending. Dev (non-https BETTER_AUTH_URL): full
mail printed to the wrangler console — that's how you grab verification/reset links
locally.

**Email Sending is ENABLED for bankofsol.app** (2026-08-08; DKIM selector `cf-bounce`,
return-path `cf-bounce.bankofsol.app`, tag `77031d818695423299be531b4cbe1cd6`). DNS
was auto-provisioned in the Cloudflare-managed zone and verified live: DKIM
(`cf-bounce._domainkey`), SPF + MX on `cf-bounce`, and `_dmarc` at **`p=reject`**.
Sender is locked to `sol@bankofsol.app` by the mailer's `allowed_sender_addresses`.

`layout()` takes an optional `brand`/`site`/`siteLabel` so product-line mail (Sol & Ray:
`sendSolrayLeadReceived`, `sendSolrayLeadNotice`) carries its own header while keeping
the sender, the automation disclosure, and the not-a-bank line.

## 7 · Safety invariants (non-negotiable)

1. **No private keys or seed material anywhere** — code, DB, env, logs, docs. The
   crypto payment rails store RECEIVING addresses only (public, superadmin-only);
   the sanitizer refuses anything key- or seed-shaped.
2. Never copy from `/Users/sol/AI MAIN/APPS/BankOfSol` (old CDP server-wallet
   experiment; its `.env`/`wallet_data.txt` are off-limits).
3. `DemoAccountPreview` takes NO data props — demo figures come only from its
   exported `DEMO_ACCOUNT` constant, with structural labeling (PREVIEW ribbon,
   watermark, ·DEMO chips, simulated-preview footer). No APY/yield language.
4. **The public site stays crypto-free** — the front recruits members; crypto is a
   payment method inside /billing, never marketing. (Internal framing, not stated
   publicly: bankofsol.app is the platform through which money flows to/from Sol.)
5. **The ledger is facts, claims are intents.** Balance truth is
   SUM(ledger_entry.amountCents) and nothing else; crypto claims only touch the
   ledger when Sol confirms them; voids/forgiveness book REVERSING entries, never
   deletions.

## 8 · Roadmap

Phase 1 (this) — live site: auth, consulting, paid booking, shop, custody waitlist +
teaser. Phase 2 — Slant 3D print fulfillment (`fulfilling` status + tracking cron;
degraded manual mode without `SLANT3D_API_KEY`). Phase 3 — watch-only custody vault +
Solana Pay merchant checkout (raw JSON-RPC, no SDK). Full plan:
`/Users/sol/.claude/plans/how-does-a-bank-imperative-sunbeam.md`.

## Changelog

- **2026-09-04** — **Sol & Ray: review pass, savings estimator, privacy notice, Searchlight
  page.** Fixes from review: anchors no longer hide under the sticky header
  (`scroll-margin-top`), skip link, visible focus, reduced-motion guard, client-side
  validation before POST, `aria-live` on form errors, example call labeled as
  illustrative, ordered list for the steps. New: interactive savings estimator
  (`SrSavings.jsx`, formula printed, defaults labeled assumptions); shared chrome
  (`SrChrome.jsx`); `/sol-and-ray/privacy` written to B&P § 22575 (CalOPPA) plus an
  accessibility statement (DOJ 2024 ADA Title II rule → WCAG 2.1 AA); the pilot form
  links it. `/sol-and-ray/searchlight` is the Twilio AI Startup Searchlight slice
  (story/persona/outcome, AI decision moment, inline-SVG architecture diagram, the four
  judging criteria, path to production, credits math at Twilio's published US rates,
  `DEMO_URL` const). Same three routes on the solandray.com host as `/`, `/privacy`,
  `/searchlight`. No API or schema change.

- **2026-09-04** — **Sol & Ray landing page + lead queue.** New product line
  (AI reference-check assistant for school-district hiring offices) gets its own
  page at `/sol-and-ray` (`/solandray` redirects) with its own light chrome — the
  Bank of Sol nav/footer stay off it — and renders as the whole site on the
  `solandray.com` / `solray.co` hosts (`isSolRayHost()`; add those zones to
  `wrangler.jsonc` routes once they are in this Cloudflare account). Lead capture is
  first-party: `POST /api/solray/pilot-request` (public; honeypot + 5/IP/day) →
  `solray_lead` (0006) → confirmation to the requester + notice to
  `SOLRAY_NOTIFY_EMAIL` (Kaasi.serrano@gmail.com), both through email.js with a
  SOL & RAY header. Admin → "Sol & Ray leads" tab (status + private note; badge =
  new leads). `usePageMeta` gains `fullTitle`/`description`. Copy mirrors the legal
  packet in `DATA/DATA/sol-and-ray-legal/` (no vendor names, no unverified figures).
  Verified locally at desktop + 375px (no overflow); form → 201 → row + 2 email_log
  rows ok=1. Not yet deployed; remote migration 0006 pending.

- **2026-08-08** — **Shop separated from the main site.** shop.bankofsol.app is now a
  standalone storefront (own minimal chrome, non-shop paths bounce to the apex) for
  things Sol makes outside POUND; the main site no longer links or routes to it
  (apex `/shop*` forwards to the subdomain; inline only in local dev). Deployed.
- **2026-08-08** — **The pivot: member platform + billing ledger.** Public site
  de-crypto'd (custody/vault marketing removed; /custody 301s to /membership;
  meta/JSON-LD/Terms/Privacy/footer rewritten — front recruits members, crypto
  lives behind the login as a payment method). `custody_account`→`member_account`;
  new banking core (0005): signed ledger, invoices+items, XRP/SOL/BTC/TON payment
  rails with claim-confirm flow, loans with monthly cron tracking, engagements,
  reviews. New surfaces: /membership, /billing (member account page), Admin →
  Members (full account management), SuperAdmin → Payment rails. Stripe webhook
  gains `bos_invoice`. Gates: requireCustodyClient→requireMember.
- **2026-08-08** — **Production verified end-to-end.** `BETTER_AUTH_SECRET` set; Sol's
  admin account created and email-verified through the REAL mail path (email_log:
  verify ok=1 → welcome ok=1), confirming Worker → service binding → mailer →
  Email Sending delivers. Starter seed applied remotely (5 availability rules, 2
  services, shop + product). Live slot math correct (weekends excluded, lead gate
  honored, last start 14:30 PT = exactly duration+buffer before 16:00). Checkout
  without a Stripe key degrades to a clean 503 and rolls back its pending row (0
  orphans). Custody teaser verified logged-out: blurred preview, PREVIEW ribbon, 6
  ·DEMO chips, no-yield footer, zero APY language. **Still pending: Stripe keys** —
  until `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` are set, both checkout rails
  503 by design and nothing can be sold.
- **2026-08-08** — **Went live.** Created D1 `bankofsol`
  (`716caa51-02da-4005-b765-1f283fa9f0bb`) + R2 `bankofsol-uploads`; deployed
  `bankofsol-mailer` (cron `0 16 * * *`) then `bankofsol` with all three custom
  domains (apex/www/shop, certs issued); applied all 4 migrations remotely; enabled
  Email Sending (DNS auto-provisioned + verified). Added the required
  `public/.assetsignore` so `dist/_worker.js` is never published as a public asset.
  Remaining before first real signup: `BETTER_AUTH_SECRET`, then Stripe keys.
- **2026-08-07** — Starter content promoted to a first-class idempotent seed
  (`scripts/seed-starter.sql`, `npm run db:seed[:remote]`) so the sample services,
  availability, shop, and product ship in production too.
- **2026-08-07** — Initial Phase 1 build: scaffold, Better Auth (1.6.23) with hard
  verification gate, shop (Stripe, guest checkout), booking system (computed slots,
  guarded-INSERT race safety, .ics, auto-refund policy), custody waitlist + demo-labeled
  teaser, admin/superadmin, mailer Worker with daily cron, PWA manifest. Verified E2E
  locally at desktop + 375px (auth chain, slot math incl. lead/buffer/weekend gating,
  checkout chains to the Stripe boundary, custody lifecycle, email ledger).
