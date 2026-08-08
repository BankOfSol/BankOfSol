import { json, error, nowIso, str, clientIp } from "../../lib/util.js";
import { getSessionUser } from "../../lib/auth.js";
import {
  MAX_QTY,
  MAX_PENDING_PER_USER,
  MAX_PENDING_PER_IP,
  GUEST_PENDING_WINDOW_MS,
  isBuyable,
  centsToUsd,
  makeRefCode,
} from "../../lib/shop.js";
import { stripeRequest, returnBaseFor } from "../../lib/stripe.js";

const parseColors = (s) => {
  try {
    return JSON.parse(s) || [];
  } catch {
    return [];
  }
};

// POST /api/shop/checkout {productId, qty, colorName, note, returnUrl} — the
// card rail. A pending order row goes in first, then the Stripe Checkout
// Session, and the order flips to paid via the webhook (or the /confirm
// fallback on return). Price comes from the product row only — the client
// never sends an amount.
//
// **Public: buying does NOT need an account.** A session is used when there
// is one (the order links to the account and shows up under My Orders), but a
// guest gets the same checkout — Stripe collects their email, name and
// shipping address, and those are snapshotted onto the order when it's paid.
export async function onRequestPost({ request, env }) {
  const user = await getSessionUser(env, request);

  let body;
  try {
    body = await request.json();
  } catch {
    return error(400, "Invalid JSON body");
  }

  const productId = String(body.productId || "");
  if (!productId) return error(400, "productId is required");

  const returnBase = returnBaseFor(env, body.returnUrl);
  if (!returnBase) return error(400, "returnUrl is required (and must be one of ours)");

  const product = await env.DB.prepare(
    `SELECT p.*, s."status" AS "shopStatus"
       FROM "product" p JOIN "shop" s ON s."id" = p."shopId"
      WHERE p."id" = ?`
  )
    .bind(productId)
    .first();
  if (!product || product.shopStatus !== "active" || product.status !== "published") {
    return error(404, "Product not found");
  }
  if (!isBuyable(product.priceCents)) {
    return error(409, "This product isn't priced yet");
  }

  const qty = parseInt(body.qty, 10) || 1;
  if (qty < 1 || qty > MAX_QTY) return error(400, `Quantity must be 1–${MAX_QTY}`);

  // Color is required exactly when the product offers colors, and must be one
  // of them — the order snapshots the *name* so later palette edits don't
  // rewrite what was bought.
  const colors = parseColors(product.colors);
  let colorName = null;
  if (colors.length > 0) {
    colorName = str(body.colorName, 40);
    if (!colors.some((c) => c.name === colorName)) {
      return error(400, "Pick one of the available colors");
    }
  }

  // Spam cap. Abandoned Stripe sessions clear themselves (checkout.session
  // .expired flips them ~35 minutes in), so this only ever bites someone
  // hammering the button. An account is capped on its own open orders; a
  // guest, having no account, is capped per client IP over a rolling hour.
  const buyerIp = user ? null : clientIp(request) || null;
  if (user) {
    const open = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM "shop_order" WHERE "userId" = ? AND "status" = 'pending'`
    )
      .bind(user.id)
      .first();
    if ((open?.n ?? 0) >= MAX_PENDING_PER_USER) {
      return error(
        409,
        `You have ${MAX_PENDING_PER_USER} unfinished orders — pay or cancel one first`
      );
    }
  } else if (buyerIp) {
    const since = new Date(Date.now() - GUEST_PENDING_WINDOW_MS).toISOString();
    const open = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM "shop_order"
        WHERE "buyerIp" = ? AND "status" = 'pending' AND "createdAt" >= ?`
    )
      .bind(buyerIp, since)
      .first();
    if ((open?.n ?? 0) >= MAX_PENDING_PER_IP) {
      return error(429, "Too many checkouts started from here — try again shortly");
    }
  }

  const amountCents = product.priceCents * qty;
  const note = str(body.note, 500) || null;
  const now = nowIso();
  const id = crypto.randomUUID();

  // refCode is UNIQUE and short — on the (astronomically rare) collision,
  // retry with a fresh code instead of failing the order.
  let refCode = null;
  for (let attempt = 0; attempt < 5 && !refCode; attempt++) {
    const candidate = makeRefCode();
    try {
      await env.DB.prepare(
        `INSERT INTO "shop_order"
           ("id","shopId","productId","userId","buyerIp","refCode","productName","colorName",
            "qty","amountCents","payMethod","note","status","createdAt","updatedAt")
         VALUES (?,?,?,?,?,?,?,?,?,?,'stripe',?,'pending',?,?)`
      )
        .bind(
          id,
          product.shopId,
          product.id,
          user?.id ?? null,
          buyerIp,
          candidate,
          product.name,
          colorName,
          qty,
          amountCents,
          note,
          now,
          now
        )
        .run();
      refCode = candidate;
    } catch (e) {
      if (!/UNIQUE/i.test(e?.message || "")) throw e;
    }
  }
  if (!refCode) return error(500, "Couldn't generate an order code — try again");

  let session;
  try {
    session = await stripeRequest(env, "POST", "/checkout/sessions", {
      mode: "payment",
      line_items: [
        {
          quantity: qty,
          price_data: {
            currency: "usd",
            unit_amount: product.priceCents,
            product_data: {
              name: colorName ? `${product.name} — ${colorName}` : product.name,
              ...(product.description ? { description: product.description } : {}),
            },
          },
        },
      ],
      shipping_address_collection: { allowed_countries: ["US"] },
      success_url: `${returnBase}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${returnBase}?checkout=cancel`,
      expires_at: Math.floor(Date.now() / 1000) + 35 * 60, // Stripe min is 30m; margin for clock skew
      ...(user?.email ? { customer_email: user.email } : {}),
      metadata: {
        kind: "bos_shop",
        orderId: id,
        ...(user ? { userId: user.id } : {}),
        refCode,
      },
    });
  } catch (e) {
    // Drop the pending row so it doesn't sit against the buyer's open-order cap.
    await env.DB.prepare(
      `DELETE FROM "shop_order" WHERE "id" = ? AND "status" = 'pending'`
    )
      .bind(id)
      .run();
    // 503, NOT 502: Cloudflare's edge swaps an origin 502 for its own error
    // page and the JSON body never reaches the browser. 503 passes through.
    return error(503, e.message || "Could not start checkout");
  }

  await env.DB.prepare(
    `UPDATE "shop_order" SET "stripeSessionId" = ?, "updatedAt" = ? WHERE "id" = ?`
  )
    .bind(session.id, nowIso(), id)
    .run();

  return json({
    url: session.url,
    sessionId: session.id,
    order: { id, refCode, amountCents, amountUsd: centsToUsd(amountCents) },
  });
}
