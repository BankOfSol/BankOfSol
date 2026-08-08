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

      <h3>Custody service</h3>
      <p>
        Custody at Bank of Sol is a self-directed safekeeping arrangement: we
        hold digital assets you send to a dedicated deposit address, secured on
        offline hardware, and return them on your instruction after manual
        review and offline signing. Custodied assets are <strong>not FDIC or
        SIPC insured</strong>, earn <strong>no interest or yield</strong>, and
        are never lent, staked, or rehypothecated. Custody accounts are
        approved at our sole discretion and may be closed with notice, with
        assets returned to an address you control. Digital assets are volatile;
        you alone bear market risk.
      </p>

      <h3>Consulting &amp; bookings</h3>
      <p>
        Booked sessions are paid in advance. Cancellations 24 hours or more
        before the start time receive a full automatic refund; later
        cancellations are at our discretion. Deliverables and scope beyond a
        session are agreed in writing.
      </p>

      <h3>Shop</h3>
      <p>
        Shop purchases are fulfilled as described on the product page. Made-to-
        order items (including 3D-printed goods) may have longer lead times.
        Payment processing is provided by Stripe; we never see or store your
        card number.
      </p>

      <h3>Acceptable use</h3>
      <p>
        You may not use Bank of Sol to launder money, evade sanctions, or hold
        assets that aren't yours. We may refuse or reverse service to comply
        with law.
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
