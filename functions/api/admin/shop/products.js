import {
  requireAdmin,
  json,
  error,
  nowIso,
  logAdminActivity,
} from "../../../lib/util.js";
import { sanitizeProduct, publicProduct } from "../../../lib/shop.js";

// The caller's shop row, or null. All product mutations are scoped to it so
// an admin can only ever touch their own catalog (multi-shop ready).
const ownShop = (env, userId) =>
  env.DB.prepare(`SELECT "id" FROM "shop" WHERE "ownerUserId" = ?`)
    .bind(userId)
    .first();

// POST /api/admin/shop/products — create or update (body with "id" updates,
// without creates). The full product payload is sent both ways;
// sanitizeProduct validates everything.
export async function onRequestPost({ request, env }) {
  const gate = await requireAdmin(env, request);
  if (gate.error) return gate.error;

  let body;
  try {
    body = await request.json();
  } catch {
    return error(400, "Invalid JSON body");
  }

  const shop = await ownShop(env, gate.user.id);
  if (!shop) return error(409, "Save your shop profile first");

  const { product, error: msg } = sanitizeProduct(body);
  if (msg) return error(400, msg);

  const now = nowIso();
  let id = body.id ? String(body.id) : null;

  if (id) {
    const res = await env.DB.prepare(
      `UPDATE "product" SET "name"=?, "description"=?, "priceCents"=?, "images"=?,
              "modelUrl"=?, "modelKind"=?, "colors"=?, "status"=?, "sortOrder"=?, "updatedAt"=?
        WHERE "id"=? AND "shopId"=?`
    )
      .bind(
        product.name,
        product.description,
        product.priceCents,
        product.images,
        product.modelUrl,
        product.modelKind,
        product.colors,
        product.status,
        product.sortOrder,
        now,
        id,
        shop.id
      )
      .run();
    if (!res.meta || res.meta.changes === 0) return error(404, "Product not found");
    await logAdminActivity(env, gate.user, "shop.product.update", {
      id,
      name: product.name,
      status: product.status,
    });
  } else {
    id = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO "product"
         ("id","shopId","name","description","priceCents","images","modelUrl",
          "modelKind","colors","status","sortOrder","createdAt","updatedAt")
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
    )
      .bind(
        id,
        shop.id,
        product.name,
        product.description,
        product.priceCents,
        product.images,
        product.modelUrl,
        product.modelKind,
        product.colors,
        product.status,
        product.sortOrder,
        now,
        now
      )
      .run();
    await logAdminActivity(env, gate.user, "shop.product.create", {
      id,
      name: product.name,
    });
  }

  const row = await env.DB.prepare(`SELECT * FROM "product" WHERE "id" = ?`)
    .bind(id)
    .first();
  return json({ ok: true, product: publicProduct(row) });
}

// DELETE /api/admin/shop/products?id= — hard delete only while no orders
// point at the product; with order history, archive instead so refCodes stay
// resolvable.
export async function onRequestDelete({ request, env }) {
  const gate = await requireAdmin(env, request);
  if (gate.error) return gate.error;

  const url = new URL(request.url);
  const id = String(url.searchParams.get("id") || "");
  if (!id) return error(400, "id is required");

  const shop = await ownShop(env, gate.user.id);
  if (!shop) return error(404, "Product not found");

  const used = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM "shop_order" WHERE "productId" = ?`
  )
    .bind(id)
    .first();
  if ((used?.n ?? 0) > 0) {
    return error(409, "This product has orders — archive it instead of deleting");
  }

  const res = await env.DB.prepare(
    `DELETE FROM "product" WHERE "id" = ? AND "shopId" = ?`
  )
    .bind(id, shop.id)
    .run();
  if (!res.meta || res.meta.changes === 0) return error(404, "Product not found");

  await logAdminActivity(env, gate.user, "shop.product.delete", { id });
  return json({ ok: true });
}
