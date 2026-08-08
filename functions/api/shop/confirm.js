import { json, error, nowIso } from "../../lib/util.js";
import { stripeRequest, shippingJson, buyerFrom } from "../../lib/stripe.js";
import { sendOrderPaidNotification } from "../../lib/email.js";

// POST /api/shop/confirm {sessionId} — webhook fallback. When the buyer lands
// back on the success URL we re-check the session against Stripe and flip the
// matching pending order to paid straight away, instead of waiting on (or
// requiring) the webhook.
//
// **Public**, because the shop is: a guest has no session to be scoped
// against. What authorizes the call is Stripe itself — the order only moves
// if Stripe says that session is paid, and the caller has to already hold the
// `cs_…` id, which is unguessable and only ever appears in the buyer's own
// return URL. The response carries no address or contact details.
export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return error(400, "Invalid JSON body");
  }
  const sessionId = String(body.sessionId || "");
  if (!/^cs_/.test(sessionId)) return error(400, "sessionId is required");

  const session = await stripeRequest(env, "GET", `/checkout/sessions/${sessionId}`);
  if (session?.metadata?.kind !== "bos_shop") return error(404, "Unknown session");
  if (session.payment_status !== "paid") return json({ paid: false });

  // COALESCE so this and the webhook can't blank each other's shipping address
  // or buyer details (see the note in stripe/webhook.js).
  const buyer = buyerFrom(session);
  const res = await env.DB.prepare(
    `UPDATE "shop_order"
        SET "status" = 'paid',
            "shipping"   = COALESCE(?, "shipping"),
            "buyerEmail" = COALESCE(?, "buyerEmail"),
            "buyerName"  = COALESCE(?, "buyerName"),
            "updatedAt"  = ?
      WHERE "stripeSessionId" = ? AND "status" = 'pending'`
  )
    .bind(shippingJson(session), buyer.email, buyer.name, nowIso(), sessionId)
    .run();

  const order = await env.DB.prepare(
    `SELECT "id","refCode","productName","colorName","qty","amountCents","buyerEmail","buyerName","status"
       FROM "shop_order" WHERE "stripeSessionId" = ?`
  )
    .bind(sessionId)
    .first();

  // Notify Sol only when THIS call actually flipped the row — the webhook
  // races us, and whoever wins sends the one email.
  if (res.meta?.changes === 1 && order) {
    await sendOrderPaidNotification(env, order);
  }

  return json({
    paid: true,
    order: order
      ? {
          id: order.id,
          refCode: order.refCode,
          productName: order.productName,
          colorName: order.colorName,
          qty: order.qty,
          amountCents: order.amountCents,
          status: order.status,
        }
      : null,
  });
}
