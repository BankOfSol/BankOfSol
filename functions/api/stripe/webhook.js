import { json, error, nowIso } from "../../lib/util.js";
import { verifyStripeSignature, shippingJson, buyerFrom } from "../../lib/stripe.js";
import {
  sendOrderPaidNotification,
  sendBookingConfirmed,
  sendBookingNotification,
} from "../../lib/email.js";
import { recordInvoicePayment } from "../../lib/ledger.js";

// POST /api/stripe/webhook — the one endpoint Stripe calls for everything we
// sell. No session auth: the HMAC signature IS the auth (STRIPE_WEBHOOK_SECRET,
// from the endpoint's config in the Stripe dashboard). Events we care about:
// checkout.session.completed + checkout.session.expired.
//
// Dispatch is by `metadata.kind`, which every checkout we create stamps —
// anything unrecognized is acknowledged and ignored, so adding a new product
// line (bos_booking, bos_print, ...) never means touching this file's plumbing.
const HANDLERS = {
  bos_shop: async (env, event, session) => {
    if (event.type === "checkout.session.completed" && session.payment_status === "paid") {
      // COALESCE: the webhook and the /confirm fallback race, and only one of
      // them may have been handed a shipping address (the field's location
      // moved between Stripe API versions) — whoever runs second must not
      // blank out what the first one stored. Same for the buyer's email/name,
      // which for a guest order is the ONLY identity the row will ever have.
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
        .bind(shippingJson(session), buyer.email, buyer.name, nowIso(), session.id)
        .run();
      // Notify Sol only when THIS handler flipped the row (the /confirm
      // fallback races us; whoever wins sends the one email).
      if (res.meta?.changes === 1) {
        const order = await env.DB.prepare(
          `SELECT * FROM "shop_order" WHERE "stripeSessionId" = ?`
        )
          .bind(session.id)
          .first();
        if (order) await sendOrderPaidNotification(env, order);
      }
    } else if (event.type === "checkout.session.expired") {
      await env.DB.prepare(
        `UPDATE "shop_order" SET "status" = 'expired', "updatedAt" = ?
          WHERE "stripeSessionId" = ? AND "status" = 'pending'`
      )
        .bind(nowIso(), session.id)
        .run();
    }
  },

  bos_booking: async (env, event, session) => {
    if (event.type === "checkout.session.completed" && session.payment_status === "paid") {
      // COALESCE("buyerEmail", ?) — member checkouts already carry their
      // account identity; Stripe's snapshot only fills the guest gaps.
      const buyer = buyerFrom(session);
      const res = await env.DB.prepare(
        `UPDATE "booking"
            SET "status" = 'paid',
                "buyerEmail" = COALESCE("buyerEmail", ?),
                "buyerName"  = COALESCE("buyerName", ?),
                "updatedAt"  = ?
          WHERE "stripeSessionId" = ? AND "status" = 'pending'`
      )
        .bind(buyer.email, buyer.name, nowIso(), session.id)
        .run();
      // Confirmation emails fire from whichever of webhook/confirm flips the
      // row — changes === 1 means it was us.
      if (res.meta?.changes === 1) {
        const booking = await env.DB.prepare(
          `SELECT * FROM "booking" WHERE "stripeSessionId" = ?`
        )
          .bind(session.id)
          .first();
        if (booking) {
          await sendBookingConfirmed(env, booking);
          await sendBookingNotification(env, booking);
        }
      }
    } else if (event.type === "checkout.session.expired") {
      // Frees the slot: expired pendings stop blocking the overlap check.
      await env.DB.prepare(
        `UPDATE "booking" SET "status" = 'expired', "updatedAt" = ?
          WHERE "stripeSessionId" = ? AND "status" = 'pending'`
      )
        .bind(nowIso(), session.id)
        .run();
    }
  },

  bos_invoice: async (env, event, session) => {
    // Invoices have no pending row to expire — the checkout session is
    // stateless against the invoice, so only 'completed' matters here.
    if (event.type !== "checkout.session.completed" || session.payment_status !== "paid") {
      return;
    }
    const invoice = await env.DB.prepare(`SELECT * FROM "invoice" WHERE "id" = ?`)
      .bind(String(session.metadata.invoiceId || ""))
      .first();
    if (!invoice) return;
    // The /api/billing/confirm fallback races us; the session id is the
    // idempotency key — whoever writes the ledger entry first wins.
    const already = await env.DB.prepare(
      `SELECT 1 FROM "ledger_entry" WHERE "kind" = 'payment' AND "reference" = ?`
    )
      .bind(session.id)
      .first();
    if (already) return;
    const amountCents = parseInt(session.metadata.amountCents, 10) || session.amount_total;
    await recordInvoicePayment(env, invoice, amountCents, {
      method: "stripe",
      reference: session.id,
      createdBy: "stripe",
    });
  },
};

export async function onRequestPost({ request, env }) {
  const payload = await request.text();
  const ok = await verifyStripeSignature(
    env,
    payload,
    request.headers.get("stripe-signature")
  );
  if (!ok) return error(400, "Bad signature");

  let event;
  try {
    event = JSON.parse(payload);
  } catch {
    return error(400, "Bad payload");
  }

  const session = event?.data?.object;
  const handler = HANDLERS[session?.metadata?.kind];
  if (handler) await handler(env, event, session);

  return json({ received: true });
}

export { HANDLERS };
