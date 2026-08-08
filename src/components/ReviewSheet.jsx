import { useState } from "react";
import { api } from "../lib/api.js";

// Post-booking review modal: 1–5 stars + a few words. Opened from /billing's
// "How was {service}?" prompt cards for completed, not-yet-reviewed bookings.
export default function ReviewSheet({ booking, onDone, onClose }) {
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e) {
    e.preventDefault();
    if (!rating) {
      setErr("Pick a star rating first.");
      return;
    }
    setErr("");
    setBusy(true);
    try {
      await api.postReview({ bookingId: booking.id, rating, body });
      onDone?.();
    } catch (e2) {
      setErr(e2.message || "Couldn't post the review");
      setBusy(false);
    }
  }

  return (
    <div className="sheet-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h3>How was {booking.serviceName}?</h3>
        <p className="muted">
          {booking.startAt ? new Date(booking.startAt).toLocaleDateString() : ""}
        </p>

        <form onSubmit={submit}>
          <div className="form-field">
            <label>
              Rating <span className="req">*</span>
            </label>
            <div className="row" style={{ gap: 2 }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`star-btn${n <= rating ? " on" : ""}`}
                  aria-label={`${n} star${n > 1 ? "s" : ""}`}
                  aria-pressed={n <= rating}
                  onClick={() => setRating(n)}
                >
                  {n <= rating ? "★" : "☆"}
                </button>
              ))}
            </div>
          </div>

          <div className="form-field">
            <label>Your words</label>
            <textarea
              rows={4}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="What stood out?"
              maxLength={2000}
            />
          </div>

          {err && <div className="form-result error">{err}</div>}

          <div className="sheet-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="btn btn-gold" disabled={busy}>
              {busy ? "Posting…" : "Post review"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
