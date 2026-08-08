import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useMe } from "../lib/me-context.jsx";
import { api } from "../lib/api.js";
import { fmtUsd } from "../lib/money.js";
import { shopSiteUrl } from "../lib/host.js";
import VerifyBanner from "../components/VerifyBanner.jsx";
import usePageMeta from "../lib/usePageMeta.js";

const MEMBER_BADGE = {
  applied: ["badge-gold", "Application pending"],
  approved: ["badge-green", "Member"],
  rejected: ["badge-red", "Not approved"],
  suspended: ["badge-red", "Suspended"],
  closed: ["badge", "Closed"],
};

function fmtWhen(iso, tz) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
      ...(tz ? { timeZone: tz } : {}),
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export default function Dashboard() {
  usePageMeta({ title: "Dashboard" });
  const { me, membership } = useMe();
  const [bookings, setBookings] = useState(null);
  const [orders, setOrders] = useState(null);

  useEffect(() => {
    api.myBookings().then((d) => setBookings(d.bookings || [])).catch(() => setBookings([]));
    api.myOrders().then((d) => setOrders(d.orders || [])).catch(() => setOrders([]));
  }, []);

  const upcoming = (bookings || []).filter(
    (b) => b.status === "paid" && new Date(b.startAt) > new Date()
  );
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
        {/* Membership + billing — the financial heart of the dashboard. */}
        <div className="card pillar">
          <div className="spread">
            <h3>🧾 Your account</h3>
            <span className={`badge ${memberBadgeClass}`}>{memberBadgeText}</span>
          </div>
          {!membership && (
            <>
              <p>
                Membership gets you an itemized account: engagements, invoices,
                and payments, tracked like a bank statement.
              </p>
              <Link className="pillar-link" to="/membership">
                Apply for membership →
              </Link>
            </>
          )}
          {membership?.status === "applied" && (
            <>
              <p>
                Your application is in the queue. You'll get an email the
                moment Sol decides — most reviews happen within a day.
              </p>
              <Link className="pillar-link" to="/membership">
                See where you stand →
              </Link>
            </>
          )}
          {membership?.status === "approved" && (
            <>
              <p>
                Your ledger, invoices, engagements, and payment options live on
                your account page.
              </p>
              <Link className="pillar-link" to="/billing">
                Open your account →
              </Link>
            </>
          )}
          {(membership?.status === "rejected" ||
            membership?.status === "suspended" ||
            membership?.status === "closed") && (
            <p className="muted">
              Questions about your membership? Reply to the decision email and
              a real person answers.
            </p>
          )}
        </div>

        <div className="card pillar">
          <h3>📅 Upcoming sessions</h3>
          {bookings === null ? (
            <p className="muted">Loading…</p>
          ) : upcoming.length ? (
            upcoming.slice(0, 3).map((b) => (
              <div className="kv" key={b.id}>
                <span className="k">{b.serviceName}</span>
                <span className="v">{fmtWhen(b.startAt, b.buyerTz)}</span>
              </div>
            ))
          ) : (
            <p className="muted">Nothing booked. Sol's calendar is open.</p>
          )}
          <Link className="pillar-link" to="/book">
            Book time →
          </Link>
        </div>

        <div className="card pillar">
          <h3>📦 Recent orders</h3>
          {orders === null ? (
            <p className="muted">Loading…</p>
          ) : orders.length ? (
            orders.slice(0, 3).map((o) => (
              <div className="kv" key={o.id}>
                <span className="k">
                  {o.productName} ×{o.qty}
                </span>
                <span className="v">
                  {fmtUsd(o.amountCents)}{" "}
                  <span className={`badge ${o.status === "paid" || o.status === "fulfilled" ? "badge-green" : ""}`}>
                    {o.status}
                  </span>
                </span>
              </div>
            ))
          ) : (
            <p className="muted">No orders yet.</p>
          )}
          <a className="pillar-link" href={shopSiteUrl("/")}>
            Browse the shop →
          </a>
        </div>
      </div>
    </div>
  );
}
