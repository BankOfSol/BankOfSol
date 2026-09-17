import { json, error, nowIso, str } from "../../lib/util.js";
import { rayTokenOk } from "../../lib/hub.js";

// Chain verification for crypto payment claims (shared token, Ray only).
//   GET  /api/ray/claims  → {claims, rails}: pending claims that have a txRef and no
//                            fresh check (each with the receiving address + tag it
//                            should have paid), plus every active rail (for balances)
//   POST /api/ray/claims  {checks:[{id, ok, chain, amount, symbol, usd, toAddress,
//                                   matchesRail, confirmed, error}]}
// Ray looks each tx up on the public explorer and reports; the ledger still
// only moves when Sol clicks Confirm. Rechecks happen after 6 hours so an
// unconfirmed tx gets picked up once it lands.

const RECHECK_MS = 6 * 60 * 60 * 1000;

export async function onRequestGet({ request, env }) {
  if (!rayTokenOk(env, request)) return error(401, "Bad token");
  const staleBefore = new Date(Date.now() - RECHECK_MS).toISOString();
  const { results } = await env.DB.prepare(
    `SELECT pc."id", pc."chain", pc."txRef", pc."createdAt", pc."chainCheckJson",
            i."refCode", i."totalCents" - i."paidCents" AS "remainingCents",
            r."address" AS "railAddress", r."tag" AS "railTag"
       FROM "payment_claim" pc
       JOIN "invoice" i ON i."id" = pc."invoiceId"
       LEFT JOIN "crypto_rail" r ON r."chain" = pc."chain" AND r."active" = 1
      WHERE pc."status" = 'pending' AND pc."txRef" IS NOT NULL
        AND (pc."chainCheckedAt" IS NULL OR pc."chainCheckedAt" < ?)
      ORDER BY pc."createdAt" LIMIT 20`
  )
    .bind(staleBefore)
    .all();
  const rails = await env.DB.prepare(
    `SELECT "chain","address","tag","label" FROM "crypto_rail" WHERE "active" = 1 ORDER BY "chain"`
  ).all();
  return json({ claims: results || [], rails: rails.results || [] });
}

export async function onRequestPost({ request, env }) {
  if (!rayTokenOk(env, request)) return error(401, "Bad token");
  let body;
  try {
    body = await request.json();
  } catch {
    return error(400, "Invalid JSON body");
  }
  const now = nowIso();
  let updated = 0;
  for (const c of (Array.isArray(body.checks) ? body.checks : []).slice(0, 50)) {
    const id = str(c?.id, 60);
    if (!id) continue;
    const check = {
      ok: !!c.ok,
      chain: str(c.chain, 8) || null,
      amount: c.amount === undefined || c.amount === null ? null : String(c.amount).slice(0, 40),
      symbol: str(c.symbol, 8) || null,
      usd: Number.isFinite(+c.usd) ? Math.round(+c.usd * 100) / 100 : null,
      toAddress: str(c.toAddress, 130) || null,
      matchesRail: c.matchesRail === true ? true : c.matchesRail === false ? false : null,
      confirmed: c.confirmed === true ? true : c.confirmed === false ? false : null,
      error: str(c.error, 200) || null,
      checkedAt: now,
    };
    const res = await env.DB.prepare(
      `UPDATE "payment_claim" SET "chainCheckJson" = ?, "chainCheckedAt" = ? WHERE "id" = ? AND "status" = 'pending'`
    )
      .bind(JSON.stringify(check), now, id)
      .run();
    if (res.meta?.changes) updated++;
  }
  return json({ ok: true, updated });
}
