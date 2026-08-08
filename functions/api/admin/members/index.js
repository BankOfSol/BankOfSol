import { requireAdmin, json } from "../../../lib/util.js";

// GET /api/admin/members?search= — every member account with the numbers that
// matter at a glance: signed balance (＋ owes / − credit), open invoices,
// pending crypto claims, active loans and engagements.
export async function onRequestGet({ request, env }) {
  const gate = await requireAdmin(env, request);
  if (gate.error) return gate.error;

  const url = new URL(request.url);
  const search = (url.searchParams.get("search") || "").trim().toLowerCase();

  const binds = [];
  let where = "1=1";
  if (search.length >= 2) {
    where = '(LOWER(u."email") LIKE ? OR LOWER(u."name") LIKE ?)';
    binds.push(`%${search}%`, `%${search}%`);
  }

  const { results } = await env.DB.prepare(
    `SELECT ma."id" AS "memberAccountId", ma."status" AS "memberStatus",
            ma."appliedAt", u."id" AS "userId", u."email", u."name",
            COALESCE((SELECT SUM(le."amountCents") FROM "ledger_entry" le WHERE le."userId" = u."id"), 0) AS "balanceCents",
            (SELECT COUNT(*) FROM "invoice" i WHERE i."userId" = u."id" AND i."status" IN ('open','partial')) AS "openInvoices",
            (SELECT COUNT(*) FROM "payment_claim" pc WHERE pc."userId" = u."id" AND pc."status" = 'pending') AS "pendingClaims",
            (SELECT COUNT(*) FROM "loan" l WHERE l."userId" = u."id" AND l."status" = 'active') AS "activeLoans",
            (SELECT COUNT(*) FROM "engagement" e WHERE e."userId" = u."id" AND e."status" IN ('onboarding','active')) AS "activeEngagements"
       FROM "member_account" ma JOIN "user" u ON u."id" = ma."userId"
      WHERE ${where}
      ORDER BY "pendingClaims" DESC, "balanceCents" DESC, u."email"
      LIMIT 200`
  )
    .bind(...binds)
    .all();

  return json({ members: results || [] });
}
