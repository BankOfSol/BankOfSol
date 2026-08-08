import {
  requireAdmin,
  json,
  error,
  nowIso,
  logAdminActivity,
} from "../../../lib/util.js";
import { ORDER_STATUSES, ORDER_TRANSITIONS } from "../../../lib/shop.js";

const ownShop = (env, userId) =>
  env.DB.prepare(`SELECT "id" FROM "shop" WHERE "ownerUserId" = ?`)
    .bind(userId)
    .first();

// GET /api/admin/shop/orders?status= — the caller's shop's orders. Most rows
// are guest checkouts, so the buyer's contact details come off the order
// itself (snapshotted from Stripe); the "user" join only fills in for member
// orders.
export async function onRequestGet({ request, env }) {
  const gate = await requireAdmin(env, request);
  if (gate.error) return gate.error;

  const shop = await ownShop(env, gate.user.id);
  if (!shop) return json({ orders: [] });

  const url = new URL(request.url);
  const status = url.searchParams.get("status") || "all";
  if (status !== "all" && !ORDER_STATUSES.includes(status)) {
    return error(400, "Invalid status filter");
  }

  const binds = [shop.id];
  let where = 'o."shopId" = ?';
  if (status !== "all") {
    where += ' AND o."status" = ?';
    binds.push(status);
  }

  const { results } = await env.DB.prepare(
    // o.* already carries "buyerEmail"/"buyerName" (the Stripe snapshot), so
    // the account columns get their own names rather than colliding.
    `SELECT o.*, u."email" AS "accountEmail", u."name" AS "accountName"
       FROM "shop_order" o LEFT JOIN "user" u ON u."id" = o."userId"
      WHERE ${where}
      ORDER BY o."createdAt" DESC LIMIT 200`
  )
    .bind(...binds)
    .all();

  return json({ orders: results || [] });
}

// POST /api/admin/shop/orders — { id, action } where action is the *target*
// status, validated against ORDER_TRANSITIONS so an order can't jump straight
// to fulfilled from pending or reopen from a terminal state. Refunds move the
// money in the Stripe dashboard; this records the outcome.
export async function onRequestPost({ request, env }) {
  const gate = await requireAdmin(env, request);
  if (gate.error) return gate.error;

  let body;
  try {
    body = await request.json();
  } catch {
    return error(400, "Invalid JSON body");
  }

  const id = String(body.id || "");
  const action = String(body.action || "");
  if (!id) return error(400, "id is required");
  if (!["paid", "fulfilled", "cancelled", "refunded"].includes(action)) {
    return error(400, "action must be paid, fulfilled, cancelled, or refunded");
  }

  const shop = await ownShop(env, gate.user.id);
  if (!shop) return error(404, "Order not found");

  const order = await env.DB.prepare(
    `SELECT "id","refCode","status" FROM "shop_order"
      WHERE "id" = ? AND "shopId" = ?`
  )
    .bind(id, shop.id)
    .first();
  if (!order) return error(404, "Order not found");

  if (!(ORDER_TRANSITIONS[order.status] || []).includes(action)) {
    return error(400, `Can't mark a ${order.status} order as ${action}`);
  }

  await env.DB.prepare(
    `UPDATE "shop_order" SET "status" = ?, "updatedAt" = ? WHERE "id" = ?`
  )
    .bind(action, nowIso(), id)
    .run();

  await logAdminActivity(env, gate.user, "shop.order.status", {
    id,
    refCode: order.refCode,
    from: order.status,
    to: action,
  });
  return json({ ok: true, status: action });
}
