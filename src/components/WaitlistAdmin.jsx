import { useEffect, useState } from "react";
import { api } from "../lib/api.js";

// Admin → Waitlist: who asked to get in. Inviting is a manual step (Sol
// emails them and points them at /signup); the status here is bookkeeping.
const FILTERS = [
  ["new", "New"],
  ["invited", "Invited"],
  ["closed", "Closed"],
  ["all", "All"],
];

export default function WaitlistAdmin({ onChanged }) {
  const [filter, setFilter] = useState("new");
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");

  const load = () =>
    api
      .adminWaitlist(filter)
      .then((d) => setRows(d.waitlist || []))
      .catch((e) => setErr(e.message));
  useEffect(() => {
    setRows(null);
    load();
  }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps

  async function setStatus(row, status) {
    try {
      await api.adminWaitlistAction({ id: row.id, status });
      load();
      onChanged?.();
    } catch (e) {
      setErr(e.message);
    }
  }

  return (
    <div>
      <div className="row" style={{ marginBottom: 14 }}>
        {FILTERS.map(([k, label]) => (
          <button key={k} type="button" className={`btn btn-sm ${filter === k ? "btn-gold" : "btn-ghost"}`} onClick={() => setFilter(k)}>
            {label}
          </button>
        ))}
      </div>
      {err && <div className="form-result error">{err}</div>}
      {rows === null ? (
        <div className="spinner">Loading…</div>
      ) : !rows.length ? (
        <div className="empty">Nobody here yet.</div>
      ) : (
        <div className="table-wrap">
          <table className="list">
            <thead>
              <tr>
                <th>When</th>
                <th>Who</th>
                <th>Note</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="muted" style={{ whiteSpace: "nowrap" }}>{new Date(r.createdAt).toLocaleDateString()}</td>
                  <td>
                    {r.name && <strong>{r.name}<br /></strong>}
                    <a href={`mailto:${r.email}?subject=Bank%20of%20Sol`}>{r.email}</a>
                  </td>
                  <td className="muted" style={{ fontSize: "0.88rem" }}>{r.note || "—"}</td>
                  <td>
                    <span className={`badge ${r.status === "new" ? "badge-gold" : r.status === "invited" ? "badge-green" : ""}`}>{r.status}</span>
                  </td>
                  <td>
                    <div className="row" style={{ gap: 6 }}>
                      {r.status !== "invited" && (
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setStatus(r, "invited")}>
                          Mark invited
                        </button>
                      )}
                      {r.status !== "closed" && (
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setStatus(r, "closed")}>
                          Close
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
