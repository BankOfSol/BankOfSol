import MembershipTeaser from "../components/MembershipTeaser.jsx";
import usePageMeta from "../lib/usePageMeta.js";

// Behind the login: apply for (or check on) membership. Approval unlocks the
// ledger and reimbursements. The public marketing version of this page is
// gone — the public site is the waitlist.
export default function Membership() {
  usePageMeta({ title: "Membership" });
  return (
    <div className="page">
      <section className="section" style={{ maxWidth: 720, margin: "0 auto" }}>
        <h1>Membership</h1>
        <p className="muted">
          Every member is approved personally by Sol. Once you're approved you get an itemized account
          and can file receipts for reimbursement.
        </p>
        <MembershipTeaser />
      </section>
    </div>
  );
}
