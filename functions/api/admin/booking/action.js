import {
  requireAdmin,
  json,
  error,
  nowIso,
  str,
  logAdminActivity,
} from "../../../lib/util.js";
import { BOOKING_TRANSITIONS } from "../../../lib/booking.js";
import { stripeRequest } from "../../../lib/stripe.js";
import { sendBookingCancelled, sendBookingConfirmed } from "../../../lib/email.js";

// POST /api/admin/booking/action — { id, action, meetingUrl?, refund? }
//   action 'complete'  paid → completed
//   action 'cancel'    pending|paid → cancelled (refund: true refunds first → 'refunded')
//   action 'meeting'   set/replace meetingUrl on a paid booking (re-emails the buyer)
// Every path validated against BOOKING_TRANSITIONS and logged.
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

  const booking = await env.DB.prepare(`SELECT * FROM "booking" WHERE "id" = ?`)
    .bind(id)
    .first();
  if (!booking) return error(404, "Booking not found");

  if (action === "meeting") {
    const meetingUrl = str(body.meetingUrl, 300);
    if (meetingUrl && !/^https:\/\//.test(meetingUrl)) {
      return error(400, "Meeting link must be an https:// URL");
    }
    if (booking.status !== "paid") {
      return error(409, "Meeting links go on paid bookings");
    }
    await env.DB.prepare(
      `UPDATE "booking" SET "meetingUrl" = ?, "updatedAt" = ? WHERE "id" = ?`
    )
      .bind(meetingUrl || null, nowIso(), id)
      .run();
    if (meetingUrl && booking.buyerEmail) {
      await sendBookingConfirmed(env, { ...booking, meetingUrl });
    }
    await logAdminActivity(env, gate.user, "booking.meeting", { id, refCode: booking.refCode });
    return json({ ok: true });
  }

  if (action === "complete") {
    if (!(BOOKING_TRANSITIONS[booking.status] || []).includes("completed")) {
      return error(400, `Can't complete a ${booking.status} booking`);
    }
    await env.DB.prepare(
      `UPDATE "booking" SET "status" = 'completed', "updatedAt" = ? WHERE "id" = ?`
    )
      .bind(nowIso(), id)
      .run();
    await logAdminActivity(env, gate.user, "booking.complete", { id, refCode: booking.refCode });
    return json({ ok: true, status: "completed" });
  }

  if (action === "cancel") {
    const wantRefund = !!body.refund && booking.status === "paid";
    const target = wantRefund ? "refunded" : "cancelled";
    if (!(BOOKING_TRANSITIONS[booking.status] || []).includes(target)) {
      return error(400, `Can't cancel a ${booking.status} booking`);
    }

    if (wantRefund) {
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
        return error(503, e.message || "Refund failed — booking unchanged");
      }
    }

    await env.DB.prepare(
      `UPDATE "booking" SET "status" = ?, "updatedAt" = ? WHERE "id" = ?`
    )
      .bind(target, nowIso(), id)
      .run();
    if (booking.buyerEmail) {
      await sendBookingCancelled(env, booking, { refunded: wantRefund });
    }
    await logAdminActivity(env, gate.user, "booking.cancel", {
      id,
      refCode: booking.refCode,
      refunded: wantRefund,
    });
    return json({ ok: true, status: target });
  }

  return error(400, "action must be complete, cancel, or meeting");
}
