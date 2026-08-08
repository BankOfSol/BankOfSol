import { useEffect, useState } from "react";
import { api } from "../lib/api.js";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// Weekly availability rules + one-off date exceptions. Rules are wall-clock
// America/Los_Angeles (that's stated in the UI so future-Sol doesn't guess).
export default function AvailabilityEditor() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [rule, setRule] = useState({ weekday: 1, startTime: "10:00", endTime: "16:00" });
  const [exc, setExc] = useState({ date: "", kind: "closed", startTime: "", endTime: "", note: "" });

  const load = () => {
    api
      .adminAvailability()
      .then(setData)
      .catch((e) => setErr(e.message));
  };
  useEffect(load, []);

  async function addRule(e) {
    e.preventDefault();
    setErr("");
    try {
      await api.adminSaveAvailability({ kind: "rule", ...rule });
      load();
    } catch (e2) {
      setErr(e2.message);
    }
  }

  async function toggleRule(r) {
    setErr("");
    try {
      await api.adminSaveAvailability({ kind: "rule", id: r.id, ...r, active: !r.active });
      load();
    } catch (e2) {
      setErr(e2.message);
    }
  }

  async function removeItem(kind, id) {
    setErr("");
    try {
      await api.adminDeleteAvailability(kind, id);
      load();
    } catch (e2) {
      setErr(e2.message);
    }
  }

  async function addException(e) {
    e.preventDefault();
    setErr("");
    try {
      await api.adminSaveAvailability({ kind: "exception", ...exc });
      setExc({ date: "", kind: "closed", startTime: "", endTime: "", note: "" });
      load();
    } catch (e2) {
      setErr(e2.message);
    }
  }

  if (!data) return <div className="spinner">Loading…</div>;

  return (
    <div>
      <p className="muted" style={{ fontSize: "0.9rem" }}>
        Weekly windows are wall-clock <strong>America/Los_Angeles</strong>.
        Clients see slots in their own timezone.
      </p>
      {err && <div className="form-result error">{err}</div>}

      <div className="card" style={{ marginBottom: 16 }}>
        <h3>Weekly windows</h3>
        {!data.rules.length && <div className="empty">No windows yet — add one below.</div>}
        {data.rules.map((r) => (
          <div className="spread" key={r.id} style={{ padding: "6px 0", borderBottom: "1px solid var(--line)" }}>
            <span style={{ opacity: r.active ? 1 : 0.45 }}>
              <strong>{WEEKDAYS[r.weekday]}</strong> · {r.startTime}–{r.endTime}
              {!r.active && <span className="badge" style={{ marginLeft: 8 }}>off</span>}
            </span>
            <span className="row" style={{ flexWrap: "nowrap" }}>
              <button className="btn btn-ghost btn-sm" onClick={() => toggleRule(r)}>
                {r.active ? "Pause" : "Resume"}
              </button>
              <button className="btn btn-danger btn-sm" onClick={() => removeItem("rule", r.id)}>
                Delete
              </button>
            </span>
          </div>
        ))}
        <form className="row" style={{ marginTop: 12, alignItems: "flex-end" }} onSubmit={addRule}>
          <div className="form-field" style={{ margin: 0, minWidth: 130 }}>
            <label>Day</label>
            <select
              value={rule.weekday}
              onChange={(e) => setRule((s) => ({ ...s, weekday: +e.target.value }))}
            >
              {WEEKDAYS.map((d, i) => (
                <option key={d} value={i}>
                  {d}
                </option>
              ))}
            </select>
          </div>
          <div className="form-field" style={{ margin: 0, width: 110 }}>
            <label>From</label>
            <input
              type="time"
              required
              value={rule.startTime}
              onChange={(e) => setRule((s) => ({ ...s, startTime: e.target.value }))}
            />
          </div>
          <div className="form-field" style={{ margin: 0, width: 110 }}>
            <label>To</label>
            <input
              type="time"
              required
              value={rule.endTime}
              onChange={(e) => setRule((s) => ({ ...s, endTime: e.target.value }))}
            />
          </div>
          <button className="btn btn-gold btn-sm">Add window</button>
        </form>
      </div>

      <div className="card">
        <h3>Date exceptions</h3>
        {!data.exceptions.length && (
          <div className="empty">None — the weekly windows run as-is.</div>
        )}
        {data.exceptions.map((x) => (
          <div className="spread" key={x.id} style={{ padding: "6px 0", borderBottom: "1px solid var(--line)" }}>
            <span>
              <strong>{x.date}</strong> ·{" "}
              {x.kind === "closed" ? (
                <span className="red">closed all day</span>
              ) : (
                <span className="green">
                  extra window {x.startTime}–{x.endTime}
                </span>
              )}
              {x.note && <span className="muted"> — {x.note}</span>}
            </span>
            <button className="btn btn-danger btn-sm" onClick={() => removeItem("exception", x.id)}>
              Delete
            </button>
          </div>
        ))}
        <form className="row" style={{ marginTop: 12, alignItems: "flex-end" }} onSubmit={addException}>
          <div className="form-field" style={{ margin: 0, width: 160 }}>
            <label>Date</label>
            <input
              type="date"
              required
              value={exc.date}
              onChange={(e) => setExc((s) => ({ ...s, date: e.target.value }))}
            />
          </div>
          <div className="form-field" style={{ margin: 0, minWidth: 130 }}>
            <label>Kind</label>
            <select
              value={exc.kind}
              onChange={(e) => setExc((s) => ({ ...s, kind: e.target.value }))}
            >
              <option value="closed">Closed (blackout)</option>
              <option value="open">Extra open window</option>
            </select>
          </div>
          {exc.kind === "open" && (
            <>
              <div className="form-field" style={{ margin: 0, width: 110 }}>
                <label>From</label>
                <input
                  type="time"
                  required
                  value={exc.startTime}
                  onChange={(e) => setExc((s) => ({ ...s, startTime: e.target.value }))}
                />
              </div>
              <div className="form-field" style={{ margin: 0, width: 110 }}>
                <label>To</label>
                <input
                  type="time"
                  required
                  value={exc.endTime}
                  onChange={(e) => setExc((s) => ({ ...s, endTime: e.target.value }))}
                />
              </div>
            </>
          )}
          <button className="btn btn-gold btn-sm">Add exception</button>
        </form>
      </div>
    </div>
  );
}
