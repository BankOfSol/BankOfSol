import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useMe } from "../lib/me-context.jsx";
import { api } from "../lib/api.js";
import AdminMembers from "../components/AdminMembers.jsx";
import MembershipQueueAdmin from "../components/MembershipQueueAdmin.jsx";
import BookingAdmin from "../components/BookingAdmin.jsx";
import AvailabilityEditor from "../components/AvailabilityEditor.jsx";
import usePageMeta from "../lib/usePageMeta.js";

function EmailLog() {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    api.emailLog().then((d) => setRows(d.log || [])).catch(() => setRows([]));
  }, []);
  if (rows === null) return <div className="spinner">Loading…</div>;
  if (!rows.length) return <div className="empty">No mail sent yet.</div>;
  return (
    <div className="table-wrap">
      <table className="list">
        <thead>
          <tr>
            <th>When</th>
            <th>To</th>
            <th>Kind</th>
            <th>Subject</th>
            <th>Result</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="muted">{new Date(r.createdAt).toLocaleString()}</td>
              <td>{r.toEmail}</td>
              <td>
                <span className="badge">{r.kind}</span>
              </td>
              <td>{r.subject}</td>
              <td>
                {r.ok ? (
                  <span className="badge badge-green">sent</span>
                ) : (
                  <span className="badge badge-red" title={r.error || ""}>
                    failed
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const TABS = [
  { key: "members", label: "👥 Members" },
  { key: "applications", label: "📨 Applications" },
  { key: "bookings", label: "📅 Bookings" },
  { key: "availability", label: "🗓 Availability" },
  { key: "shop", label: "🛒 Shop" },
  { key: "email", label: "✉️ Email log" },
];

export default function Admin() {
  usePageMeta({ title: "Admin" });
  const { me } = useMe();
  const [tab, setTab] = useState("members");
  const [counts, setCounts] = useState({});

  const loadCounts = () => {
    api.adminCounts().then(setCounts).catch(() => {});
  };
  useEffect(loadCounts, []);

  // Server-side gates are the enforcement; this is presentation.
  if (me && !me.isAdmin) {
    return (
      <div className="page narrow">
        <div className="panel">
          <h1>Admins only</h1>
          <p className="muted">This area is for Bank of Sol staff.</p>
        </div>
      </div>
    );
  }

  const badge = {
    members: counts.pendingClaims,
    applications: counts.membershipApplied,
    bookings: counts.upcomingBookings,
    shop: counts.paidOrders,
  };

  return (
    <div className="page">
      <div className="spread" style={{ marginBottom: 6 }}>
        <h1 style={{ margin: 0 }}>Admin</h1>
        {me?.isSuperAdmin && (
          <Link className="btn btn-ghost btn-sm" to="/superadmin">
            Super admin
          </Link>
        )}
      </div>

      <div className="tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`tab${tab === t.key ? " active" : ""}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
            {badge[t.key] > 0 && <span className="tab-badge">{badge[t.key]}</span>}
          </button>
        ))}
      </div>

      {tab === "members" && <AdminMembers onChanged={loadCounts} />}
      {tab === "applications" && <MembershipQueueAdmin onChanged={loadCounts} />}
      {tab === "bookings" && <BookingAdmin onChanged={loadCounts} />}
      {tab === "availability" && <AvailabilityEditor />}
      {tab === "shop" && (
        <div className="panel">
          <h3>The shop manages itself in place</h3>
          <p className="muted">
            Products, orders, and the shop profile live on the storefront —
            open it with the manage view switched on.
          </p>
          <Link className="btn btn-gold" to="/shop?view=manage">
            Open shop manager →
          </Link>
        </div>
      )}
      {tab === "email" && <EmailLog />}
    </div>
  );
}
