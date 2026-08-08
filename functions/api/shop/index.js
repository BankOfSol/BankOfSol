import { getSessionUser } from "../../lib/auth.js";
import { json } from "../../lib/util.js";
import { publicShop, publicProduct } from "../../lib/shop.js";

// GET /api/shop — the storefront: the active shop + its buyable products.
// Public. v1 is single-shop (first active row); multi-shop later adds a
// ?slug= lookup without changing this response shape.
export async function onRequestGet({ request, env }) {
  const user = await getSessionUser(env, request);

  const shop = await env.DB.prepare(
    `SELECT * FROM "shop" WHERE "status" = 'active' ORDER BY "createdAt" LIMIT 1`
  ).first();
  if (!shop) {
    return json({ shop: null, products: [], signedIn: !!user });
  }

  const { results } = await env.DB.prepare(
    `SELECT * FROM "product"
      WHERE "shopId" = ? AND "status" IN ('published','soldout')
      ORDER BY "sortOrder", "createdAt" DESC`
  )
    .bind(shop.id)
    .all();

  return json({
    shop: publicShop(shop),
    products: (results || []).map(publicProduct),
    signedIn: !!user,
  });
}
