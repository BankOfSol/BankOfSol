import { Link } from "react-router-dom";
import { useMe } from "../lib/me-context.jsx";
import VerifyBanner from "../components/VerifyBanner.jsx";
import usePageMeta from "../lib/usePageMeta.js";

const MEMBER_BADGE = {
  applied: ["badge-gold", "Application pending"],
  approved: ["badge-green", "Member"],
  rejected: ["badge-red", "Not approved"],
  suspended: ["badge-red", "Suspended"],
  closed: ["badge", "Closed"],
};

export default function Dashboard() {
  usePageMeta({ title: "Dashboard" });
  const { me, membership } = useMe();
  const [memberBadgeClass, memberBadgeText] = membership
    ? MEMBER_BADGE[membership.status] || ["badge", membership.status]
    : ["badge", "Not a member yet"];

  return (
    <div className="page">
      <div className="spread" style={{ marginBottom: 18 }}>
        <h1 style={{ margin: 0 }}>
          {me?.name ? `Welcome, ${me.name.split(" ")[0]}.` : "Your dashboard"}
        </h1>
        <div className="row">
          {me?.isAdmin && (
            <Link className="btn btn-ghost btn-sm" to="/admin">
              Admin
            </Link>
          )}
          <Link className="btn btn-ghost btn-sm" to="/account">
            Account
          </Link>
        </div>
      </div>
      <VerifyBanner />

      <div className="pillars" style={{ marginTop: 0 }}>
        <div className="card pillar">
          <div className="spread">
            <h3>🧾 Receipts & reimbursements</h3>
            <span className={`badge ${memberBadgeClass}`}>{memberBadgeText}</span>
          </div>
          {membership?.status === "approved" ? (
            <>
              <p>Snap receipts, let the scanner read them, and send them to Sol for approval and payout.</p>
              <Link className="pillar-link" to="/reimbursements">
                Open the receipt desk →
              </Link>
            </>
          ) : membership?.status === "applied" ? (
            <p className="muted">Your membership is waiting on Sol. Reimbursements unlock once it's approved.</p>
          ) : (
            <>
              <p>Membership unlocks receipts, reimbursements, and your itemized ledger.</p>
              <Link className="pillar-link" to="/membership">
                Apply for membership →
              </Link>
            </>
          )}
        </div>

        <div className="card pillar">
          <h3>📒 Your ledger</h3>
          <p>Every approved reimbursement, payout, invoice, and payment, itemized like a bank statement.</p>
          <Link className="pillar-link" to="/billing">
            Open your ledger →
          </Link>
        </div>
      </div>
    </div>
  );
}
