import { useEffect, useState } from "react";
import { api } from "../lib/api.js";

const STATUSES = ["new", "contacted", "pilot", "closed"];

// Admin → Sol & Ray leads: the pilot-request queue from /sol-and-ray. Move a
// lead along its status and keep a private note; the requester is emailed by
// hand (Sol replies personally), never from here.
export default function SolrayLeadsAdmin({ onChanged }) {
  const [filter, setFilter] = useState("new");
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState("");

  const load = () => {
    setRows(null);
    api.adminSolrayLeads(filter).then((d) => setRows(d.leads || [])).catch(() => setRows([]));
  };
  useEffect(load, [filter]);

  const act = async (id, status, adminNote) => {
    setBusy(id);
    try {
      await api.adminSolrayLeadAction(id, status, adminNote);
      load();
      onChanged?.();
    } finally {
      setBusy("");
    }
  };

  return (
    <div>
      <div className="row" style={{ marginBottom: 14, flexWrap: "wrap" }}>
        {["new", "contacted", "pilot", "closed", "all"].map((s) => (
          <button
            key={s}
            className={`btn btn-sm ${filter === s ? "btn-gold" : "btn-ghost"}`}
            onClick={() => setFilter(s)}
          >
            {s}
          </button>
        ))}
      </div>
      {rows === null && <div className="spinner">Loading…</div>}
      {rows && !rows.length && <div className="empty">No leads here.</div>}
      {rows && rows.length > 0 && (
        <div className="stack">
          {rows.map((r) => (
            <div className="card" key={r.id}>
              <div className="spread" style={{ alignItems: "flex-start", gap: 12 }}>
                <div>
                  <h3 style={{ margin: "0 0 4px" }}>
                    {r.org} <span className={`badge ${r.status === "new" ? "badge-gold" : ""}`}>{r.status}</span>
                  </h3>
                  <div>
                    {r.name}
                    {r.title ? `, ${r.title}` : ""} · <a href={`mailto:${r.email}`}>{r.email}</a>
                    {r.phone ? ` · ${r.phone}` : ""}
                  </div>
                  <div className="muted" style={{ fontSize: ".9rem" }}>
                    {new Date(r.createdAt).toLocaleString()}
                    {r.volume ? ` · ${r.volume}` : ""}
                    {r.source ? ` · via ${r.source}` : ""}
                  </div>
                </div>
                <select
                  value={r.status}
                  disabled={busy === r.id}
                  onChange={(e) => act(r.id, e.target.value)}
                  style={{ width: "auto" }}
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              {r.message && <p style={{ whiteSpace: "pre-wrap", margin: "12px 0 0" }}>{r.message}</p>}
              <div className="form-field" style={{ margin: "12px 0 0" }}>
                <label>Private note</label>
                <textarea
                  rows={2}
                  defaultValue={r.adminNote || ""}
                  onBlur={(e) => {
                    if ((e.target.value || "") !== (r.adminNote || "")) act(r.id, r.status, e.target.value);
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
