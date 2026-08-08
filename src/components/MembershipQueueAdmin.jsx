import { useEffect, useState } from "react";
import { api } from "../lib/api.js";

const FILTERS = ["applied", "approved", "rejected", "all"];

export default function MembershipQueueAdmin({ onChanged }) {
  const [filter, setFilter] = useState("applied");
  const [rows, setRows] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [err, setErr] = useState("");

  const load = (f = filter) => {
    setRows(null);
    api
      .adminMembershipQueue(f)
      .then((d) => setRows(d.applications || []))
      .catch((e) => {
        setErr(e.message);
        setRows([]);
      });
  };
  useEffect(() => load(filter), [filter]); // eslint-disable-line react-hooks/exhaustive-deps

  async function decide(id, action) {
    const note =
      action === "reject"
        ? window.prompt("Optional note (kept internal):") || undefined
        : undefined;
    setBusyId(id);
    setErr("");
    try {
      await api.adminMembershipDecide(id, action, note);
      load();
      onChanged?.();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="row" style={{ marginBottom: 14 }}>
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
      {err && <div className="form-result error">{err}</div>}
      {rows === null ? (
        <div className="spinner">Loading…</div>
      ) : !rows.length ? (
        <div className="empty">Nothing here.</div>
      ) : (
        <div className="table-wrap">
          <table className="list">
            <thead>
              <tr>
                <th>Applicant</th>
                <th>Motivation</th>
                <th>Applied</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <strong>{r.name || "—"}</strong>
                    <br />
                    <span className="muted">{r.email}</span>
                  </td>
                  <td style={{ maxWidth: 260 }}>{r.motivation || <span className="muted">—</span>}</td>
                  <td className="muted">{new Date(r.appliedAt).toLocaleDateString()}</td>
                  <td>
                    <span
                      className={`badge ${
                        r.status === "approved"
                          ? "badge-green"
                          : r.status === "applied"
                            ? "badge-gold"
                            : "badge-red"
                      }`}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td>
                    <div className="row" style={{ flexWrap: "nowrap" }}>
                      {(r.status === "applied" || r.status === "suspended") && (
                        <button
                          className="btn btn-green btn-sm"
                          disabled={busyId === r.id}
                          onClick={() => decide(r.id, "approve")}
                        >
                          Approve
                        </button>
                      )}
                      {r.status === "applied" && (
                        <button
                          className="btn btn-danger btn-sm"
                          disabled={busyId === r.id}
                          onClick={() => decide(r.id, "reject")}
                        >
                          Reject
                        </button>
                      )}
                      {r.status === "approved" && (
                        <button
                          className="btn btn-ghost btn-sm"
                          disabled={busyId === r.id}
                          onClick={() => decide(r.id, "suspend")}
                        >
                          Suspend
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
