import { requireMember, json, error, nowIso } from "../../../../lib/util.js";
import { stripeRequest, returnBaseFor } from "../../../../lib/stripe.js";

// POST /api/billing/invoices/:id/pay {returnUrl} — pay the OUTSTANDING amount
// of an open/partial invoice by card. Owner-scoped 404. Amount comes from the
// invoice row only; the webhook (kind bos_invoice) or /api/billing/confirm
// writes the ledger entry when Stripe says paid.
export async function onRequestPost({ request, env, params }) {
  const gate = await requireMember(env, request);
  if (gate.error) return gate.error;

  let body;
  try {
    body = await request.json();
  } catch {
    return error(400, "Invalid JSON body");
  }

  const returnBase = returnBaseFor(env, body.returnUrl);
  if (!returnBase) return error(400, "returnUrl is required (and must be one of ours)");

  const invoice = await env.DB.prepare(
    `SELECT * FROM "invoice" WHERE "id" = ? AND "userId" = ?`
  )
    .bind(String(params.id || ""), gate.user.id)
    .first();
  if (!invoice) return error(404, "Invoice not found");
  if (!["open", "partial"].includes(invoice.status)) {
    return error(409, `This invoice is ${invoice.status}`);
  }

  const remainingCents = invoice.totalCents - invoice.paidCents;
  if (remainingCents <= 0) return error(409, "Nothing left to pay");

  let session;
  try {
    session = await stripeRequest(env, "POST", "/checkout/sessions", {
      mode: "payment",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: remainingCents,
            product_data: {
              name: `${invoice.refCode} — ${invoice.title}`,
              ...(invoice.notes ? { description: invoice.notes.slice(0, 200) } : {}),
            },
          },
        },
      ],
      success_url: `${returnBase}?invoice=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${returnBase}?invoice=cancel`,
      expires_at: Math.floor(Date.now() / 1000) + 35 * 60,
      ...(gate.user.email ? { customer_email: gate.user.email } : {}),
      metadata: {
        kind: "bos_invoice",
        invoiceId: invoice.id,
        refCode: invoice.refCode,
        userId: gate.user.id,
        amountCents: String(remainingCents),
      },
    });
  } catch (e) {
    return error(503, e.message || "Could not start checkout");
  }

  return json({ url: session.url, sessionId: session.id, amountCents: remainingCents });
}
