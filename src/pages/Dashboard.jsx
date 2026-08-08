import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useMe } from "../lib/me-context.jsx";
import { api } from "../lib/api.js";
import { fmtUsd } from "../lib/money.js";
import VerifyBanner from "../components/VerifyBanner.jsx";
import usePageMeta from "../lib/usePageMeta.js";

const CUSTODY_BADGE = {
  applied: ["badge-gold", "Application pending"],
  approved: ["badge-green", "Approved"],
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
  const { me, custody } = useMe();
  const [bookings, setBookings] = useState(null);
  const [orders, setOrders] = useState(null);

  useEffect(() => {
    api.myBookings().then((d) => setBookings(d.bookings || [])).catch(() => setBookings([]));
    api.myOrders().then((d) => setOrders(d.orders || [])).catch(() => setOrders([]));
  }, []);

  const upcoming = (bookings || []).filter(
    (b) => b.status === "paid" && new Date(b.startAt) > new Date()
  );
  const [custodyBadgeClass, custodyBadgeText] = custody
    ? CUSTODY_BADGE[custody.status] || ["badge", custody.status]
    : ["badge", "No vault yet"];

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
        {/* Vault status — the financial-dashboard heart. Real balances arrive
            with the Phase 3 vault; until then this card is the state machine. */}
        <div className="card pillar">
          <div className="spread">
            <h3>🏦 Custody vault</h3>
            <span className={`badge ${custodyBadgeClass}`}>{custodyBadgeText}</span>
          </div>
          {!custody && (
            <>
              <p>
                Cold-storage custody for your Solana assets. Apply and Sol
                reviews it personally.
              </p>
              <Link className="pillar-link" to="/custody">
                Apply for a vault →
              </Link>
            </>
          )}
          {custody?.status === "applied" && (
            <>
              <p>
                Your application is in the queue. You'll get an email the
                moment Sol decides — most reviews happen within a day.
              </p>
              <Link className="pillar-link" to="/custody">
                See where you stand →
              </Link>
            </>
          )}
          {custody?.status === "approved" && (
            <>
              <p>
                You're approved. Vault onboarding opens shortly — Sol will
                reach out with your dedicated deposit address.
              </p>
              <Link className="pillar-link" to="/custody">
                Open your vault →
              </Link>
            </>
          )}
          {(custody?.status === "rejected" ||
            custody?.status === "suspended" ||
            custody?.status === "closed") && (
            <p className="muted">
              Questions about your application? Reply to the decision email and
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
          <Link className="pillar-link" to="/shop">
            Browse the shop →
          </Link>
        </div>
      </div>
    </div>
  );
}
