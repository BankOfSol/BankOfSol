import { json, error, nowIso } from "../../lib/util.js";
import { stripeRequest, buyerFrom } from "../../lib/stripe.js";
import { sendBookingConfirmed, sendBookingNotification } from "../../lib/email.js";

// POST /api/booking/confirm {sessionId} — webhook fallback, same trust model
// as the shop's: the unguessable cs_… id from the buyer's own return URL is
// the authorization, and the booking only moves if Stripe says it's paid.
// Emails fire only when THIS call flips the row (the webhook races us).
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
  if (session?.metadata?.kind !== "bos_booking") return error(404, "Unknown session");
  if (session.payment_status !== "paid") return json({ paid: false });

  const buyer = buyerFrom(session);
  const res = await env.DB.prepare(
    `UPDATE "booking"
        SET "status" = 'paid',
            "buyerEmail" = COALESCE("buyerEmail", ?),
            "buyerName"  = COALESCE("buyerName", ?),
            "updatedAt"  = ?
      WHERE "stripeSessionId" = ? AND "status" = 'pending'`
  )
    .bind(buyer.email, buyer.name, nowIso(), sessionId)
    .run();

  const booking = await env.DB.prepare(
    `SELECT * FROM "booking" WHERE "stripeSessionId" = ?`
  )
    .bind(sessionId)
    .first();

  if (res.meta?.changes === 1 && booking) {
    await sendBookingConfirmed(env, booking);
    await sendBookingNotification(env, booking);
  }

  return json({
    paid: true,
    booking: booking
      ? {
          refCode: booking.refCode,
          serviceName: booking.serviceName,
          startAt: booking.startAt,
          endAt: booking.endAt,
          buyerTz: booking.buyerTz,
          icsToken: booking.icsToken,
          status: booking.status,
        }
      : null,
  });
}
