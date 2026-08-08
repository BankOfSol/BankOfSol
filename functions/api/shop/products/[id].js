import { getSessionUser } from "../../../lib/auth.js";
import { json, error } from "../../../lib/util.js";
import { publicProduct } from "../../../lib/shop.js";

// GET /api/shop/products/:id — one product + the shop name the buy screen
// needs. Public for published/soldout; admins can open any status so drafts
// are previewable before publishing. Unknown and non-public ids both 404
// (never 403) so product ids can't be probed.
export async function onRequestGet({ request, env, params }) {
  const user = await getSessionUser(env, request);
  const id = String(params.id || "");

  const row = await env.DB.prepare(
    `SELECT p.*, s."name" AS "shopName"
       FROM "product" p JOIN "shop" s ON s."id" = p."shopId"
      WHERE p."id" = ? AND s."status" = 'active'`
  )
    .bind(id)
    .first();

  const visible =
    row && (["published", "soldout"].includes(row.status) || !!user?.isAdmin);
  if (!visible) return error(404, "Product not found");

  const { shopName, ...productRow } = row;
  return json({
    product: publicProduct(productRow),
    shop: { name: shopName },
    signedIn: !!user,
  });
}
