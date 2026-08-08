import { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { fmtUsd } from "../lib/money.js";

const FILTERS = ["all", "paid", "pending", "completed", "cancelled", "refunded"];

const fmtWhen = (iso) =>
  new Intl.DateTimeFormat(undefined, {
    timeZone: "America/Los_Angeles",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));

// Services CRUD + upcoming bookings with per-row actions. Times shown in PT
// (Sol's calendar; buyers see their own timezone on their side).
export default function BookingAdmin({ onChanged }) {
  const [services, setServices] = useState(null);
  const [bookings, setBookings] = useState(null);
  const [filter, setFilter] = useState("all");
  const [err, setErr] = useState("");
  const [editing, setEditing] = useState(null); // service being edited (or {} for new)

  const load = () => {
    api.adminBookingServices().then((d) => setServices(d.services || [])).catch((e) => setErr(e.message));
    api
      .adminBookings(filter === "all" ? {} : { status: filter })
      .then((d) => setBookings(d.bookings || []))
      .catch((e) => setErr(e.message));
  };
  useEffect(load, [filter]); // eslint-disable-line react-hooks/exhaustive-deps

  async function saveService(e) {
    e.preventDefault();
    setErr("");
    try {
      await api.adminSaveService(editing);
      setEditing(null);
      load();
    } catch (e2) {
      setErr(e2.message);
    }
  }

  async function act(b, action, extra = {}) {
    if (action === "cancel") {
      const refund =
        b.status === "paid" &&
        window.confirm("Refund the payment in full? (Cancel = no refund, order still cancels)");
      extra = { refund };
      if (!window.confirm(`Cancel ${b.refCode}?`)) return;
    }
    if (action === "meeting") {
      const meetingUrl = window.prompt("Meeting link (https://…):", b.meetingUrl || "");
      if (meetingUrl === null) return;
      extra = { meetingUrl };
    }
    setErr("");
    try {
      await api.adminBookingAction({ id: b.id, action, ...extra });
      load();
      onChanged?.();
    } catch (e2) {
      setErr(e2.message);
    }
  }

  return (
    <div>
      {err && <div className="form-result error">{err}</div>}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="spread">
          <h3>Services</h3>
          <button
            className="btn btn-gold btn-sm"
            onClick={() =>
              setEditing({
                slug: "",
                name: "",
                description: "",
                durationMin: 60,
                price: "150.00",
                slotEveryMin: 30,
                bufferMin: 15,
                leadHours: 12,
                maxDaysAhead: 30,
                active: true,
              })
            }
          >
            + New service
          </button>
        </div>
        {services === null ? (
          <div className="spinner">Loading…</div>
        ) : !services.length ? (
          <div className="empty">No services yet — bookings open once one exists.</div>
        ) : (
          services.map((s) => (
            <div
              className="spread"
              key={s.id}
              style={{ padding: "8px 0", borderBottom: "1px solid var(--line)" }}
            >
              <span style={{ opacity: s.active ? 1 : 0.45 }}>
                <strong>{s.name}</strong>{" "}
                <span className="muted">
                  · {s.durationMin} min · {fmtUsd(s.priceCents)}
                  {!s.active && " · inactive"}
                </span>
              </span>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() =>
                  setEditing({ ...s, price: (s.priceCents / 100).toFixed(2), active: !!s.active })
                }
              >
                Edit
              </button>
            </div>
          ))
        )}

        {editing && (
          <form className="card card-raised" style={{ marginTop: 12 }} onSubmit={saveService}>
            <div className="row">
              <div className="form-field" style={{ flex: 1, minWidth: 180 }}>
                <label>Name</label>
                <input
                  required
                  value={editing.name}
                  onChange={(e) => setEditing((s) => ({ ...s, name: e.target.value }))}
                />
              </div>
              <div className="form-field" style={{ flex: 1, minWidth: 160 }}>
                <label>Slug</label>
                <input
                  required
                  value={editing.slug}
                  placeholder="website-dev"
                  onChange={(e) => setEditing((s) => ({ ...s, slug: e.target.value }))}
                />
              </div>
            </div>
            <div className="form-field">
              <label>Description</label>
              <textarea
                rows={2}
                value={editing.description || ""}
                onChange={(e) => setEditing((s) => ({ ...s, description: e.target.value }))}
              />
            </div>
            <div className="row">
              {[
                ["durationMin", "Duration (min)"],
                ["price", "Price ($)"],
                ["slotEveryMin", "Slot every (min)"],
                ["bufferMin", "Buffer (min)"],
                ["leadHours", "Lead (h)"],
                ["maxDaysAhead", "Horizon (days)"],
              ].map(([k, label]) => (
                <div className="form-field" style={{ width: 120 }} key={k}>
                  <label>{label}</label>
                  <input
                    required
                    value={editing[k]}
                    onChange={(e) => setEditing((s) => ({ ...s, [k]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
            <label className="row" style={{ fontWeight: 600, marginBottom: 12 }}>
              <input
                type="checkbox"
                checked={!!editing.active}
                onChange={(e) => setEditing((s) => ({ ...s, active: e.target.checked }))}
              />
              Active (bookable)
            </label>
            <div className="row">
              <button className="btn btn-green btn-sm">Save service</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(null)}>
                Close
              </button>
            </div>
          </form>
        )}
      </div>

      <div className="card">
        <div className="spread">
          <h3>Bookings</h3>
          <div className="row">
            {FILTERS.map((f) => (
              <button
                key={f}
                className={`btn btn-sm ${filter === f ? "btn-gold" : "btn-ghost"}`}
                onClick={() => setFilter(f)}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
        {bookings === null ? (
          <div className="spinner">Loading…</div>
        ) : !bookings.length ? (
          <div className="empty">No bookings in this window.</div>
        ) : (
          <div className="table-wrap">
            <table className="list">
              <thead>
                <tr>
                  <th>When (PT)</th>
                  <th>Session</th>
                  <th>Buyer</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {bookings.map((b) => (
                  <tr key={b.id}>
                    <td>{fmtWhen(b.startAt)}</td>
                    <td>
                      {b.serviceName}
                      <br />
                      <span className="muted mono">{b.refCode}</span>
                      {b.note && (
                        <>
                          <br />
                          <span className="muted">“{b.note}”</span>
                        </>
                      )}
                    </td>
                    <td>
                      {b.buyerName || "—"}
                      <br />
                      <span className="muted">{b.buyerEmail || "—"}</span>
                    </td>
                    <td>
                      <span
                        className={`badge ${
                          b.status === "paid"
                            ? "badge-green"
                            : b.status === "pending"
                              ? "badge-gold"
                              : ["cancelled", "refunded", "expired"].includes(b.status)
                                ? "badge-red"
                                : ""
                        }`}
                      >
                        {b.status}
                      </span>
                      {b.meetingUrl && (
                        <>
                          <br />
                          <span className="muted" style={{ fontSize: "0.75rem" }}>
                            link set ✓
                          </span>
                        </>
                      )}
                    </td>
                    <td>
                      {b.status === "paid" && (
                        <div className="row" style={{ flexWrap: "nowrap" }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => act(b, "meeting")}>
                            Link
                          </button>
                          <button className="btn btn-green btn-sm" onClick={() => act(b, "complete")}>
                            Done
                          </button>
                          <button className="btn btn-danger btn-sm" onClick={() => act(b, "cancel")}>
                            Cancel
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
