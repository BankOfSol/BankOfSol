import {
  requireAdmin,
  json,
  error,
  nowIso,
  logAdminActivity,
} from "../../../lib/util.js";
import { sanitizeShop, publicProduct } from "../../../lib/shop.js";

// GET /api/admin/shop — the caller's shop (or null before first save), every
// product regardless of status, and order counts for the tab badges.
export async function onRequestGet({ request, env }) {
  const gate = await requireAdmin(env, request);
  if (gate.error) return gate.error;

  const shop = await env.DB.prepare(
    `SELECT * FROM "shop" WHERE "ownerUserId" = ?`
  )
    .bind(gate.user.id)
    .first();
  if (!shop) return json({ shop: null, products: [], orderCounts: {} });

  const [products, counts] = await Promise.all([
    env.DB.prepare(
      `SELECT * FROM "product" WHERE "shopId" = ?
        ORDER BY "sortOrder", "createdAt" DESC`
    )
      .bind(shop.id)
      .all(),
    env.DB.prepare(
      `SELECT "status", COUNT(*) AS n FROM "shop_order"
        WHERE "shopId" = ? GROUP BY "status"`
    )
      .bind(shop.id)
      .all(),
  ]);

  const orderCounts = {};
  for (const r of counts.results || []) orderCounts[r.status] = r.n;

  const { extra, ...shopRow } = shop;
  return json({
    shop: shopRow,
    products: (products.results || []).map(publicProduct),
    orderCounts,
  });
}

// PUT /api/admin/shop — save the shop profile. This upsert IS the bootstrap:
// there's no seed row in the migration, so Sol's first save creates the shop.
export async function onRequestPut({ request, env }) {
  const gate = await requireAdmin(env, request);
  if (gate.error) return gate.error;

  let body;
  try {
    body = await request.json();
  } catch {
    return error(400, "Invalid JSON body");
  }

  const { shop, error: msg } = sanitizeShop(body);
  if (msg) return error(400, msg);

  const now = nowIso();
  const existing = await env.DB.prepare(
    `SELECT "id" FROM "shop" WHERE "ownerUserId" = ?`
  )
    .bind(gate.user.id)
    .first();

  let id = existing?.id;
  if (existing) {
    await env.DB.prepare(
      `UPDATE "shop" SET "name"=?, "blurb"=?, "logoUrl"=?, "updatedAt"=? WHERE "id"=?`
    )
      .bind(shop.name, shop.blurb, shop.logoUrl, now, id)
      .run();
  } else {
    id = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO "shop"
         ("id","ownerUserId","name","blurb","logoUrl","status","createdAt","updatedAt")
       VALUES (?,?,?,?,?,'active',?,?)`
    )
      .bind(id, gate.user.id, shop.name, shop.blurb, shop.logoUrl, now, now)
      .run();
  }

  await logAdminActivity(env, gate.user, "shop.save", { id, name: shop.name });
  const row = await env.DB.prepare(`SELECT * FROM "shop" WHERE "id" = ?`)
    .bind(id)
    .first();
  const { extra, ...shopRow } = row;
  return json({ ok: true, shop: shopRow });
}
