import { json, error, nowIso, str, clientIp } from "../../lib/util.js";
import { getSessionUser } from "../../lib/auth.js";
import {
  computeSlots,
  insertBookingIfFree,
  zonedDateParts,
  MAX_OPEN_PER_USER,
  MAX_PENDING_PER_IP,
  IP_WINDOW_MS,
  CANCEL_CUTOFF_HOURS,
} from "../../lib/booking.js";
import { makeRefCode } from "../../lib/shop.js";
import { stripeRequest, returnBaseFor } from "../../lib/stripe.js";

// POST /api/booking/checkout {serviceId, startAt, buyerTz, note, returnUrl} —
// the client proposes a slot; the server RE-DERIVES the open-slot list and
// only accepts an exact member, then claims it with the race-safe guarded
// INSERT (a competing checkout for the same instant gets a 409). Payment
// confirms: the pending row flips to paid via webhook or /confirm.
//
// Public — guests book too. Stripe collects their email/name; buyerTz rides
// along from the browser so confirmations render in their local time.
export async function onRequestPost({ request, env }) {
  const user = await getSessionUser(env, request);

  let body;
  try {
    body = await request.json();
  } catch {
    return error(400, "Invalid JSON body");
  }

  const serviceId = String(body.serviceId || "");
  const startAt = String(body.startAt || "");
  if (!serviceId || !startAt) return error(400, "serviceId and startAt are required");

  const returnBase = returnBaseFor(env, body.returnUrl);
  if (!returnBase) return error(400, "returnUrl is required (and must be one of ours)");

  const service = await env.DB.prepare(
    `SELECT * FROM "consult_service" WHERE "id" = ? AND "active" = 1`
  )
    .bind(serviceId)
    .first();
  if (!service) return error(404, "Service not found");

  // Validate the proposed instant against the freshly computed slot list for
  // its LA calendar day — never trust the client's math.
  let startDate;
  try {
    startDate = new Date(startAt);
    if (Number.isNaN(startDate.getTime())) throw new Error();
  } catch {
    return error(400, "startAt must be an ISO timestamp");
  }
  const { date: laDay } = zonedDateParts(startDate);
  const slots = await computeSlots(env, service, laDay, laDay);
  const slot = slots.find((s) => Date.parse(s.startAt) === startDate.getTime());
  if (!slot) return error(409, "That time just filled up — pick another slot");

  // Spam caps: accounts by open bookings, guests per IP per hour.
  const buyerIp = user ? null : clientIp(request) || null;
  if (user) {
    const open = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM "booking"
        WHERE "userId" = ? AND "status" = 'pending'`
    )
      .bind(user.id)
      .first();
    if ((open?.n ?? 0) >= MAX_OPEN_PER_USER) {
      return error(409, "You have unfinished checkouts — complete or let one expire first");
    }
  } else if (buyerIp) {
    const since = new Date(Date.now() - IP_WINDOW_MS).toISOString();
    const open = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM "booking"
        WHERE "buyerIp" = ? AND "status" = 'pending' AND "createdAt" >= ?`
    )
      .bind(buyerIp, since)
      .first();
    if ((open?.n ?? 0) >= MAX_PENDING_PER_IP) {
      return error(429, "Too many checkouts started from here — try again shortly");
    }
  }

  // buyerTz is display-only; validate it really is an IANA zone.
  let buyerTz = str(body.buyerTz, 60) || "America/Los_Angeles";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: buyerTz });
  } catch {
    buyerTz = "America/Los_Angeles";
  }

  const now = nowIso();
  const booking = {
    id: crypto.randomUUID(),
    serviceId: service.id,
    userId: user?.id ?? null,
    buyerEmail: user?.email ?? null,
    buyerName: user?.name ?? null,
    buyerTz,
    buyerIp,
    refCode: makeRefCode(),
    icsToken: crypto.randomUUID(),
    serviceName: service.name,
    startAt: slot.startAt,
    endAt: slot.endAt,
    priceCents: service.priceCents,
    note: str(body.note, 500) || null,
    createdAt: now,
  };

  // Claim the slot atomically. changes === 0 ⇒ a competing checkout won.
  const claimed = await insertBookingIfFree(env, booking, service.bufferMin);
  if (!claimed) return error(409, "That time just filled up — pick another slot");

  // Human-readable slot time in the buyer's zone for the Stripe line item.
  const whenLocal = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: buyerTz,
  }).format(startDate);

  let session;
  try {
    session = await stripeRequest(env, "POST", "/checkout/sessions", {
      mode: "payment",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: service.priceCents,
            product_data: {
              name: `${service.name} — ${whenLocal}`,
              description: `${service.durationMin} min session with Sol. Cancel ≥${CANCEL_CUTOFF_HOURS}h before for a full refund.`,
            },
          },
        },
      ],
      success_url: `${returnBase}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${returnBase}?checkout=cancel`,
      expires_at: Math.floor(Date.now() / 1000) + 35 * 60,
      ...(user?.email ? { customer_email: user.email } : {}),
      metadata: {
        kind: "bos_booking",
        bookingId: booking.id,
        refCode: booking.refCode,
        ...(user ? { userId: user.id } : {}),
      },
    });
  } catch (e) {
    // Free the slot: the claim must not outlive a failed checkout start.
    await env.DB.prepare(
      `DELETE FROM "booking" WHERE "id" = ? AND "status" = 'pending'`
    )
      .bind(booking.id)
      .run();
    return error(503, e.message || "Could not start checkout");
  }

  await env.DB.prepare(
    `UPDATE "booking" SET "stripeSessionId" = ?, "updatedAt" = ? WHERE "id" = ?`
  )
    .bind(session.id, nowIso(), booking.id)
    .run();

  return json({
    url: session.url,
    sessionId: session.id,
    booking: { id: booking.id, refCode: booking.refCode },
  });
}
