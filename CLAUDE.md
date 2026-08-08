# Bank of Sol — contributor orientation

**Read `ARCHITECTURE.md` first** — it's the living map (stack, routes, tables,
bindings, invariants) and must be updated in the same commit as any
architecture-altering change.

## What this is

bankofsol.app + shop.bankofsol.app: a **member platform for hiring Sol** (that
framing is internal — the public site just recruits members). Paid consulting
bookings, a storefront, and behind the login the banking core: per-member
LEDGER (signed cents), invoices with line items, crypto payment rails
(XRP/SOL/BTC/TON receiving addresses + manual claim confirmation), loans with
monthly tracking, engagements, reviews. **The public site stays crypto-free**
— crypto is a payment method members see inside /billing, never marketing.
One Cloudflare Worker: React+Vite SPA (`src/`) + file-routed API (`functions/api/*`)
+ D1 + R2 + a separate mailer Worker (`workers/mailer/` — email + all crons).

## Commands

```bash
npm install --legacy-peer-deps     # kysely peer range needs it
npm run cf:dev                     # build + wrangler dev on :8788 (.dev.vars needed)
npm run dev                        # vite HMR on :5173, /api proxied to :8788
npm run build                      # vite + compile functions/ into dist/_worker.js
npm run db:migrate:local           # apply migrations/ to local D1
npm run db:migrate                 # …to remote D1
npm run deploy                     # build + wrangler deploy (the release step)
npm run deploy:mailer              # deploy workers/mailer (needed on email/digest changes)
```

⚠️ `wrangler dev` serves the BUILT worker — after editing `functions/`, run
`npm run build` (it hot-reloads). ⚠️ Local requests arrive addressed as
`http://bankofsol.app` (wrangler simulates the route) — auth.js handles it in dev.

## Hard rules

1. **No private keys/seeds anywhere, ever** — code, DB, env, logs, docs. Custody is
   watch-only (public keys only). Never copy anything from
   `/Users/sol/AI MAIN/APPS/BankOfSol` (old server-wallet experiment).
2. **Money is integer cents / base units** — `parseFloat` is banned in money files.
3. **Every route calls its gate explicitly** (`functions/lib/util.js`), server-side.
   Admin mutations call `logAdminActivity`. Owner-scoped misses return 404, not 403.
4. **Shop checkout/confirm are public on purpose** (guest checkout; the Stripe `cs_…`
   id is the authorization). Don't add auth to them.
5. **Email only via `functions/lib/email.js`** — never throws, always logs to
   `email_log` (subjects + outcomes only, never bodies/links).
6. **Demo account numbers only from `DEMO_ACCOUNT`** in `DemoAccountPreview.jsx` (no
   data props) with its structural PREVIEW/DEMO labeling. No APY/yield language
   anywhere. **The ledger is facts, claims are intents**: a crypto payment claim
   only touches the ledger when Sol confirms it; the signed ledger
   (`amountCents` + = owes, − = credit) is the single source of balance truth.
7. **Better Auth stays pinned at 1.6.23** until every version-note in
   `functions/lib/auth.js` is re-verified.
8. **Verify UI at desktop AND 375px** (no horizontal page scroll) before calling any
   `src/` change done. Styling lives in `src/styles/site.css` (single file, CSS
   variables — dark vault / gold / profit-green).
9. Return **503, never 502**, on upstream (Stripe/Slant/RPC) failures — Cloudflare
   swallows 502 bodies.
10. Update `ARCHITECTURE.md` (+ its changelog) in the same commit as any change to
    routes/tables/bindings/env/deploy.
