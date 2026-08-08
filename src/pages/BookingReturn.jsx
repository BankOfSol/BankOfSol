import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../lib/api.js";
import usePageMeta from "../lib/usePageMeta.js";

// Stripe lands the buyer here: /booking/return?checkout=success&session_id=…
// (or ?checkout=cancel). We confirm against the server (webhook fallback) and
// show the booked session + calendar link, then strip the query params.
export default function BookingReturn() {
  usePageMeta({ title: "Booking" });
  const [params] = useSearchParams();
  const [state, setState] = useState({ phase: "checking" });

  const outcome = params.get("checkout");
  const sessionId = params.get("session_id");

  useEffect(() => {
    if (outcome === "cancel") {
      setState({ phase: "cancelled" });
      window.history.replaceState({}, "", "/booking/return");
      return;
    }
    if (!sessionId) {
      setState({ phase: "nothing" });
      return;
    }
    api
      .bookingConfirm(sessionId)
      .then((d) => {
        setState(
          d.paid ? { phase: "paid", booking: d.booking } : { phase: "pending" }
        );
        window.history.replaceState({}, "", "/booking/return");
      })
      .catch((e) => setState({ phase: "error", message: e.message }));
  }, [outcome, sessionId]);

  if (state.phase === "checking") {
    return <div className="spinner">Confirming your booking…</div>;
  }

  if (state.phase === "paid" && state.booking) {
    const b = state.booking;
    const tz = b.buyerTz || Intl.DateTimeFormat().resolvedOptions().timeZone;
    const when = new Intl.DateTimeFormat(undefined, {
      timeZone: tz,
      dateStyle: "full",
      timeStyle: "short",
    }).format(new Date(b.startAt));
    return (
      <div className="page narrow">
        <div className="panel">
          <span className="badge badge-green">Booked</span>
          <h1 style={{ marginTop: 10 }}>You're on the calendar.</h1>
          <div className="kv">
            <span className="k">Session</span>
            <span className="v">{b.serviceName}</span>
          </div>
          <div className="kv">
            <span className="k">When</span>
            <span className="v">{when}</span>
          </div>
          <div className="kv">
            <span className="k">Ref</span>
            <span className="v mono">{b.refCode}</span>
          </div>
          <a
            className="btn btn-gold btn-block"
            style={{ marginTop: 14 }}
            href={`/api/booking/ics/${b.icsToken}`}
          >
            Add to calendar
          </a>
          <p className="hint" style={{ marginTop: 12 }}>
            A confirmation email with the calendar link is on its way. The
            meeting link arrives before the session. Need to cancel? It's in
            the email — full refund ≥24h out.
          </p>
        </div>
      </div>
    );
  }

  if (state.phase === "pending") {
    return (
      <div className="page narrow">
        <div className="panel">
          <h1>Almost there</h1>
          <p className="muted">
            Your payment hasn't settled yet. If you completed checkout, this
            usually resolves in a few seconds — refresh to check again.
          </p>
        </div>
      </div>
    );
  }

  if (state.phase === "cancelled") {
    return (
      <div className="page narrow">
        <div className="panel">
          <h1>Checkout cancelled</h1>
          <p className="muted">No charge was made. Your slot was released.</p>
          <Link className="btn btn-ghost" to="/book">
            ← Back to booking
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page narrow">
      <div className="panel">
        <h1>Nothing to confirm</h1>
        <p className="muted">{state.message || "This page only has content right after a checkout."}</p>
        <Link className="btn btn-ghost" to="/book">
          ← Book a session
        </Link>
      </div>
    </div>
  );
}
