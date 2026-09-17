import { useEffect, useState } from "react";
import { api } from "../lib/api.js";

// Ops: grant/revoke admin, the audit feed, the crypto receiving rails. Lives
// as a section inside the command center (SuperAdmin.jsx). isSuperAdmin is
// never grantable from anywhere — it belongs to ADMIN_EMAIL, self-healed at login.
export default function SuperAdminOps() {
  const [tab, setTab] = useState("admins");
  const [data, setData] = useState(null);
  const [search, setSearch] = useState("");
  const [activity, setActivity] = useState(null);
  const [rails, setRails] = useState(null);
  const [err, setErr] = useState("");

  const load = (q = "") => {
    api
      .superAdmins(q)
      .then(setData)
      .catch((e) => setErr(e.message));
  };
  useEffect(() => load(), []);
  useEffect(() => {
    if (tab === "activity" && activity === null) {
      api.adminActivity().then((d) => setActivity(d.activity || [])).catch(() => setActivity([]));
    }
    if (tab === "rails" && rails === null) {
      api.rails().then((d) => setRails(d.rails || [])).catch((e) => setErr(e.message));
    }
  }, [tab, activity, rails]);

  async function setFlag(userId, isAdmin) {
    setErr("");
    try {
      await api.setAdminFlags(userId, { isAdmin });
      load(search);
    } catch (e) {
      setErr(e.message);
    }
  }

  return (
    <div>
      <div className="tabs">
        {["admins", "activity", "rails"].map((t) => (
          <button key={t} className={`tab${tab === t ? " active" : ""}`} onClick={() => setTab(t)}>
            {t === "admins" ? "👥 Admins" : t === "activity" ? "📜 Activity" : "💸 Payment rails"}
          </button>
        ))}
      </div>
      {err && <div className="form-result error">{err}</div>}

      {tab === "admins" && (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <h3>Current admins</h3>
            {!data ? (
              <div className="spinner">Loading…</div>
            ) : (
              <div className="table-wrap">
                <table className="list">
                  <thead>
                    <tr>
                      <th>Who</th>
                      <th>Role</th>
                      <th>Last login</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.admins.map((a) => (
                      <tr key={a.id}>
                        <td>
                          <strong>{a.name || "—"}</strong>
                          <br />
                          <span className="muted">{a.email}</span>
                        </td>
                        <td>
                          {a.isSuperAdmin ? (
                            <span className="badge badge-gold">super admin</span>
                          ) : (
                            <span className="badge badge-green">admin</span>
                          )}
                        </td>
                        <td className="muted">
                          {a.lastLoginAt ? new Date(a.lastLoginAt).toLocaleString() : "—"}
                        </td>
                        <td>
                          {!a.isSuperAdmin && (
                            <button className="btn btn-danger btn-sm" onClick={() => setFlag(a.id, false)}>
                              Revoke
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="card">
            <h3>Promote someone</h3>
            <form
              className="row"
              onSubmit={(e) => {
                e.preventDefault();
                load(search);
              }}
            >
              <input
                style={{ flex: 1, minWidth: 200 }}
                placeholder="Search by email or name…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <button className="btn btn-ghost btn-sm">Search</button>
            </form>
            {data?.matches?.length > 0 && (
              <div className="table-wrap" style={{ marginTop: 12 }}>
                <table className="list">
                  <tbody>
                    {data.matches.map((u) => (
                      <tr key={u.id}>
                        <td>
                          <strong>{u.name || "—"}</strong>
                          <br />
                          <span className="muted">{u.email}</span>
                        </td>
                        <td>
                          {u.isSuperAdmin ? (
                            <span className="badge badge-gold">super admin</span>
                          ) : u.isAdmin ? (
                            <span className="badge badge-green">admin</span>
                          ) : (
                            <span className="badge">member</span>
                          )}
                        </td>
                        <td>
                          {!u.isAdmin && !u.isSuperAdmin && (
                            <button className="btn btn-green btn-sm" onClick={() => setFlag(u.id, true)}>
                              Make admin
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {tab === "activity" &&
        (activity === null ? (
          <div className="spinner">Loading…</div>
        ) : !activity.length ? (
          <div className="empty">No admin activity yet.</div>
        ) : (
          <div className="table-wrap">
            <table className="list">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Who</th>
                  <th>Action</th>
                  <th>Detail</th>
                </tr>
              </thead>
              <tbody>
                {activity.map((a) => (
                  <tr key={a.id}>
                    <td className="muted">{new Date(a.createdAt).toLocaleString()}</td>
                    <td>{a.actorEmail}</td>
                    <td>
                      <span className="badge">{a.action}</span>
                    </td>
                    <td className="muted mono" style={{ fontSize: "0.78rem", maxWidth: 280, overflowWrap: "anywhere" }}>
                      {a.detail || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

      {tab === "rails" && <RailsTab rails={rails} setRails={setRails} setErr={setErr} />}
    </div>
  );
}

// ── Payment rails: the PUBLIC receiving addresses members pay crypto to ──

const CHAINS = ["XRP", "SOL", "BTC", "TON"];
const emptyRail = { id: null, chain: "XRP", address: "", tag: "", label: "", active: true };

function RailsTab({ rails, setRails, setErr }) {
  const [form, setForm] = useState(emptyRail);
  const [busy, setBusy] = useState(false);
  const [copiedId, setCopiedId] = useState(null);

  const reload = () =>
    api
      .rails()
      .then((d) => setRails(d.rails || []))
      .catch((e) => setErr(e.message));

  async function act(fn) {
    setErr("");
    try {
      await fn();
      await reload();
      return true;
    } catch (e) {
      setErr(e.message);
      return false;
    }
  }

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    const ok = await act(() =>
      api.saveRail({
        ...(form.id ? { id: form.id } : {}),
        chain: form.chain,
        address: form.address.trim(),
        tag: form.tag.trim() || undefined,
        label: form.label.trim() || undefined,
        active: form.active,
      })
    );
    if (ok) setForm(emptyRail);
    setBusy(false);
  }

  function copyAddress(rail) {
    navigator.clipboard.writeText(rail.address).then(() => {
      setCopiedId(rail.id);
      setTimeout(() => setCopiedId(null), 1600);
    });
  }

  return (
    <>
      <div className="card" style={{ marginBottom: 16 }}>
        <h3>Receiving addresses</h3>
        <p className="hint" style={{ marginTop: 0 }}>
          PUBLIC receiving addresses only — never paste anything that looks like a key or seed.
        </p>
        {rails === null ? (
          <div className="spinner">Loading…</div>
        ) : !rails.length ? (
          <div className="empty">No payment rails yet — add one below.</div>
        ) : (
          <div className="table-wrap">
            <table className="list">
              <thead>
                <tr>
                  <th>Chain</th>
                  <th>Address</th>
                  <th>Tag / memo</th>
                  <th>Label</th>
                  <th>Active</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rails.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <span className="badge badge-gold">{r.chain}</span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="copy-btn"
                        style={{ maxWidth: 260 }}
                        title="Copy address"
                        onClick={() => copyAddress(r)}
                      >
                        {r.address}
                      </button>
                      {copiedId === r.id && <span className="hint green">Copied ✓</span>}
                    </td>
                    <td className="mono muted">{r.tag || "—"}</td>
                    <td className="muted">{r.label || "—"}</td>
                    <td>
                      <input
                        type="checkbox"
                        checked={!!r.active}
                        aria-label={`${r.chain} rail active`}
                        onChange={() =>
                          act(() =>
                            api.saveRail({
                              id: r.id,
                              chain: r.chain,
                              address: r.address,
                              tag: r.tag || undefined,
                              label: r.label || undefined,
                              active: !r.active,
                            })
                          )
                        }
                      />
                    </td>
                    <td>
                      <div className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() =>
                            setForm({
                              id: r.id,
                              chain: r.chain,
                              address: r.address,
                              tag: r.tag || "",
                              label: r.label || "",
                              active: !!r.active,
                            })
                          }
                        >
                          Edit
                        </button>
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() =>
                            window.confirm(`Delete the ${r.chain} rail? Members won't see it anymore.`) &&
                            act(() => api.deleteRail(r.id))
                          }
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <h3>{form.id ? "Edit rail" : "Add a rail"}</h3>
        <form onSubmit={save}>
          <div className="row" style={{ alignItems: "flex-end" }}>
            <div className="form-field" style={{ minWidth: 110, marginBottom: 10 }}>
              <label>Chain</label>
              <select
                value={form.chain}
                onChange={(e) => setForm({ ...form, chain: e.target.value })}
              >
                {CHAINS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-field" style={{ flex: 2, minWidth: 220, marginBottom: 10 }}>
              <label>
                Public address <span className="req">*</span>
              </label>
              <input
                className="mono"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                placeholder="Receiving address (public)"
                required
              />
            </div>
          </div>
          <div className="row" style={{ alignItems: "flex-end" }}>
            <div className="form-field" style={{ flex: 1, minWidth: 140, marginBottom: 10 }}>
              <label>Destination tag / memo</label>
              <input
                className="mono"
                value={form.tag}
                onChange={(e) => setForm({ ...form, tag: e.target.value })}
                placeholder="XRP tag / TON memo"
              />
            </div>
            <div className="form-field" style={{ flex: 1, minWidth: 140, marginBottom: 10 }}>
              <label>Label</label>
              <input
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                placeholder="e.g. Main vault"
              />
            </div>
            <div className="form-field" style={{ marginBottom: 10 }}>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => setForm({ ...form, active: e.target.checked })}
                />
                Active
              </label>
            </div>
          </div>
          <div className="row">
            <button className="btn btn-gold" disabled={busy}>
              {busy ? "Saving…" : form.id ? "Save rail" : "Add rail"}
            </button>
            {form.id && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={busy}
                onClick={() => setForm(emptyRail)}
              >
                Cancel edit
              </button>
            )}
          </div>
          <span className="hint">
            PUBLIC receiving addresses only — never paste anything that looks like a key or seed.
          </span>
        </form>
      </div>
    </>
  );
}
