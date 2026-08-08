import usePageMeta from "../lib/usePageMeta.js";

export default function Terms() {
  usePageMeta({ title: "Terms of Service" });
  return (
    <div className="page" style={{ maxWidth: 760 }}>
      <h1>Terms of Service</h1>
      <p className="muted">Last updated: August 2026</p>

      <h3>Who we are</h3>
      <p>
        Bank of Sol ("we", "us") is a technology and services company operating
        bankofsol.app and shop.bankofsol.app. <strong>We are not a chartered
        bank, credit union, trust company, or licensed depository
        institution.</strong> Nothing here is banking, and nothing here is
        financial, investment, legal, or tax advice.
      </p>

      <h3>Membership &amp; accounts</h3>
      <p>
        Membership is approved at our sole discretion and may be suspended or
        closed with notice. A member account is a <strong>service ledger</strong>:
        an itemized record of the consulting work engaged, invoices issued,
        payments received, and any amounts owed between us. It is not a
        deposit account, holds no funds, earns no interest, and is not FDIC
        insured.
      </p>

      <h3>Invoices &amp; payments</h3>
      <p>
        Invoices are payable as issued. Card payments are processed by Stripe;
        we never see or store your card number. Where digital-asset payment is
        offered inside your account, you are responsible for sending the exact
        asset to the exact address (including any destination tag or memo)
        shown — transfers on public networks are irreversible, and a payment
        is credited to your ledger when we confirm it on-chain. Amounts are
        denominated in USD; the USD value we confirm is the value credited.
      </p>

      <h3>Consulting &amp; bookings</h3>
      <p>
        Booked sessions are paid in advance. Cancellations 24 hours or more
        before the start time receive a full automatic refund; later
        cancellations are at our discretion. Deliverables and scope beyond a
        session are agreed in writing and itemized on your account.
      </p>

      <h3>Loans</h3>
      <p>
        Any loan between you and Bank of Sol is agreed privately in writing
        before it appears on your ledger. The ledger records disbursements,
        the monthly schedule, and repayments; the written agreement governs
        the terms. Nothing on this platform is an offer of credit.
      </p>

      <h3>Shop</h3>
      <p>
        Shop purchases are fulfilled as described on the product page. Made-to-
        order items (including 3D-printed goods) may have longer lead times.
      </p>

      <h3>Acceptable use</h3>
      <p>
        You may not use Bank of Sol to launder money, evade sanctions, or pay
        with assets that aren't yours. We may refuse or reverse service to
        comply with law.
      </p>

      <h3>Liability</h3>
      <p>
        Services are provided "as is". To the maximum extent permitted by law,
        our total liability for any claim is limited to the fees you paid us
        for the service giving rise to the claim.
      </p>

      <h3>Contact</h3>
      <p>
        <a href="mailto:sol@bankofsol.app">sol@bankofsol.app</a>
      </p>
    </div>
  );
}
