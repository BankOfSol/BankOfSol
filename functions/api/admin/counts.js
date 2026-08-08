import { requireAdmin, json } from "../../lib/util.js";

// GET /api/admin/counts — tab badges. Each count guards its own table so a
// missing migration never breaks the whole admin shell.
export async function onRequestGet({ request, env }) {
  const gate = await requireAdmin(env, request);
  if (gate.error) return gate.error;

  const count = (sql, ...binds) =>
    env.DB.prepare(sql)
      .bind(...binds)
      .first()
      .then((r) => r?.n ?? 0)
      .catch(() => 0);

  const nowIso = new Date().toISOString();
  const [custodyApplied, upcomingBookings, paidOrders] = await Promise.all([
    count(`SELECT COUNT(*) AS n FROM "custody_account" WHERE "status" = 'applied'`),
    count(
      `SELECT COUNT(*) AS n FROM "booking" WHERE "status" = 'paid' AND "startAt" > ?`,
      nowIso
    ),
    count(`SELECT COUNT(*) AS n FROM "shop_order" WHERE "status" = 'paid'`),
  ]);

  return json({ custodyApplied, upcomingBookings, paidOrders });
}
