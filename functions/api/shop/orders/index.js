import { requireUser, json } from "../../../lib/util.js";

// GET /api/shop/orders — the caller's own orders, newest first. Guest orders
// have no account to list under; guests track by the confirmation email and
// refCode instead.
export async function onRequestGet({ request, env }) {
  const gate = await requireUser(env, request);
  if (gate.error) return gate.error;

  const { results } = await env.DB.prepare(
    `SELECT "id","refCode","productId","productName","colorName","qty",
            "amountCents","payMethod","shipping","status","createdAt"
       FROM "shop_order"
      WHERE "userId" = ?
      ORDER BY "createdAt" DESC LIMIT 100`
  )
    .bind(gate.user.id)
    .all();

  return json({ orders: results || [] });
}
