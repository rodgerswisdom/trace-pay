# TRACE Pay

One shared record per avocado export deal: terms, proof of dispatch, and Payaza payments.

## Setup

```bash
pnpm install
cp .env.example .env        # set AUTH_SECRET (openssl rand -base64 32) and Payaza test keys
pnpm db:reset               # fresh local.db: migrations + triggers + seed
pnpm dev
```

The database is SQLite (`local.db`, via libsql). `pnpm db:seed` is safe to re-run; `pnpm db:reset` wipes and reseeds.
Seed data: demo exporter `demo@tracepay.test` / `avocado2026` and three sample deals —
TP-0926 awaiting deposit (USD 3,150, the spec's numbers), TP-0927 deposit paid (the pre-paid fallback), TP-0925 cancelled.
Sample payments carry `SAMPLE-` references, never real Payaza ones. Buyer links are printed by the seed.

Proof files are stored under `./storage` (local disk driver in `src/lib/storage.ts`). The server computes each file's
SHA-256 from the bytes it receives and records its own receive time; once proof is attached, database triggers refuse any
change. `pnpm db:reset` empties the database in place (safe with the dev server running) and reseeds, including watermarked
SAMPLE proof files — replace the loading photos with real avocado photos for the demo.

For a Vercel deploy, a local SQLite file and local storage won't persist (swap in an R2 driver for files): set `DATABASE_URL=libsql://…` and `DATABASE_AUTH_TOKEN` for a Turso database.

## Payaza

- Checkout: hosted Payment Page with our `merchant_reference` (`TP-0001-D-xxxx`) and a `redirect_url` back to the buyer link.
- Confirmation: `POST /api/payaza/webhook` (HMAC-SHA512 `x-payaza-signature`) **and** a status-query backstop run by the buyer and exporter page polls. Both re-check with Payaza's merchant-reference status query; the redirect alone never marks anything paid.
- Idempotent: only the update that flips a payment `pending → paid` writes timeline events; `payaza_reference` is unique.
- Set the Collections webhook URL in the Payaza dashboard (Settings → Developers) to `https://<deploy>/api/payaza/webhook`.
- Test mode doesn't settle, so balance payment records "Settlement initiated".

## Test card (sandbox)

Mastercard `5111111111111118`, expiry `01/39`, CVV `100` (non-3DS, approved).

## Quality terms and the claim check

- Each deal carries quality terms (minimum dry matter, transit temperature range, % of deal value off per breached term)
  and an optional final tranche requested when the buyer confirms arrival. The buyer sees the terms before the deposit.
- Readings are data: the packhouse dry-matter reading (value, sample size, device) is recorded with the proof and locked
  with it; the buyer records a matching reading on arrival. Neither can be edited (database triggers).
- The exporter attaches the tracker's CSV export after dispatch (`timestamp,temperature_c`; other common headers work).
  "Use sample tracker feed (demo)" attaches a clearly labelled SAMPLE feed with a clean line inside the range.
- The claim check (`src/lib/claim-check.ts`) lines up origin vs arrival vs terms: dry matter decides "immature" claims,
  the transit log decides "overripe or damaged" (excursions under 30 minutes are tolerated). It shows "Claim supported"
  (with the agreed adjustment pre-filled for the exporter) or "Claim not supported by the agreed test" to both parties
  and in the evidence bundle.
# trace-pay
