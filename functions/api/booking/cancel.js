import { json, error, nowIso } from "../../lib/util.js";
import { getSessionUser } from "../../lib/auth.js";
import { CANCEL_CUTOFF_HOURS } from "../../lib/booking.js";
import { stripeRequest } from "../../lib/stripe.js";
import { sendBookingCancelled, sendAdminNotice } from "../../lib/email.js";

// POST /api/booking/cancel {icsToken} OR {id} — buyer-side cancellation.
// Auth is either the unguessable icsToken (works for guests, lives in their
// confirmation email) or a session owning the row. Policy: a paid booking
// ≥24h before start auto-refunds in full via Stripe; inside the cutoff the
// buyer is told to reply to their confirmation email (admin discretion).
export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return error(400, "Invalid JSON body");
  }

  let booking = null;
  const icsToken = String(body.icsToken || "");
  if (icsToken) {
    booking = await env.DB.prepare(`SELECT * FROM "booking" WHERE "icsToken" = ?`)
      .bind(icsToken)
      .first();
  } else if (body.id) {
    const user = await getSessionUser(env, request);
    if (!user) return error(401, "Not signed in");
    booking = await env.DB.prepare(
      `SELECT * FROM "booking" WHERE "id" = ? AND "userId" = ?`
    )
      .bind(String(body.id), user.id)
      .first();
  }
  // Owner-scoped: wrong token/id and someone else's row both read as 404.
  if (!booking) return error(404, "Booking not found");

  if (booking.status === "pending") {
    await env.DB.prepare(
      `UPDATE "booking" SET "status" = 'cancelled', "updatedAt" = ? WHERE "id" = ? AND "status" = 'pending'`
    )
      .bind(nowIso(), booking.id)
      .run();
    return json({ ok: true, status: "cancelled", refunded: false });
  }

  if (booking.status !== "paid") {
    return error(409, `This booking is already ${booking.status}`);
  }

  const hoursOut = (Date.parse(booking.startAt) - Date.now()) / 3600000;
  if (hoursOut < CANCEL_CUTOFF_HOURS) {
    return error(
      409,
      `Sessions can self-cancel up to ${CANCEL_CUTOFF_HOURS}h before start. Reply to your confirmation email and we'll sort it out.`
    );
  }

  // Refund the full payment. The session tells us the payment_intent; if the
  // refund fails nothing changes — the buyer can retry.
  try {
    const session = await stripeRequest(
      env,
      "GET",
      `/checkout/sessions/${booking.stripeSessionId}`
    );
    if (session?.payment_intent) {
      await stripeRequest(env, "POST", "/refunds", {
        payment_intent: session.payment_intent,
      });
    }
  } catch (e) {
    return error(503, e.message || "Refund failed — nothing was changed, try again");
  }

  await env.DB.prepare(
    `UPDATE "booking" SET "status" = 'refunded', "updatedAt" = ? WHERE "id" = ? AND "status" = 'paid'`
  )
    .bind(nowIso(), booking.id)
    .run();

  await sendBookingCancelled(env, booking, { refunded: true });
  await sendAdminNotice(
    env,
    `Booking cancelled + refunded: ${booking.refCode}`,
    [
      `${booking.serviceName} at ${booking.startAt}`,
      `${booking.buyerName || "guest"} <${booking.buyerEmail || "?"}>`,
      "Cancelled by the buyer, auto-refunded in full.",
    ],
    "booking-cancel"
  );

  return json({ ok: true, status: "refunded", refunded: true });
}
