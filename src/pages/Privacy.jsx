import usePageMeta from "../lib/usePageMeta.js";

export default function Privacy() {
  usePageMeta({ title: "Privacy Policy" });
  return (
    <div className="page" style={{ maxWidth: 760 }}>
      <h1>Privacy Policy</h1>
      <p className="muted">Last updated: August 2026</p>

      <h3>What we collect</h3>
      <p>
        Account details you give us (name, email, password — hashed, never
        readable), bookings and orders you place, membership applications,
        your account ledger (invoices, payments, any loans), and — when you
        pay an invoice with a digital asset — the public transaction
        reference you supply. Server logs include IP addresses for abuse
        prevention.
      </p>

      <h3>What we don't collect</h3>
      <p>
        No advertising trackers, no analytics cookies, no selling data —
        cookies here do exactly one job: keeping you signed in. We never hold
        your card number (Stripe processes payments) and we never hold
        private keys — yours stay with you.
      </p>

      <h3>Email</h3>
      <p>
        We send transactional email only: verification, receipts,
        booking confirmations, membership decisions. Our email log stores subjects
        and delivery outcomes, never message bodies or links.
      </p>

      <h3>Sharing</h3>
      <p>
        Payment data goes to Stripe to process your payment; shipping details
        go to our fulfillment partner when a product is made to order. Beyond
        that, data leaves us only if the law requires it.
      </p>

      <h3>Your rights</h3>
      <p>
        Email <a href="mailto:sol@bankofsol.app">sol@bankofsol.app</a> to
        export or delete your account data. Billing records may be retained
        where the law requires it.
      </p>
    </div>
  );
}
