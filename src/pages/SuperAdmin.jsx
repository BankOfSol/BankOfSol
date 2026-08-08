import { useEffect, useState } from "react";
import { useMe } from "../lib/me-context.jsx";
import { api } from "../lib/api.js";
import usePageMeta from "../lib/usePageMeta.js";

// Sol only: grant/revoke admin, watch the audit feed. isSuperAdmin is never
// grantable from anywhere — it belongs to ADMIN_EMAIL, self-healed at login.
export default function SuperAdmin() {
  usePageMeta({ title: "Super Admin" });
  const { me } = useMe();
  const [tab, setTab] = useState("admins");
  const [data, setData] = useState(null);
  const [search, setSearch] = useState("");
  const [activity, setActivity] = useState(null);
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
  }, [tab, activity]);

  async function setFlag(userId, isAdmin) {
    setErr("");
    try {
      await api.setAdminFlags(userId, { isAdmin });
      load(search);
    } catch (e) {
      setErr(e.message);
    }
  }

  if (me && !me.isSuperAdmin) {
    return (
      <div className="page narrow">
        <div className="panel">
          <h1>Super admin only</h1>
          <p className="muted">This area is Sol's alone.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <h1>Super admin</h1>
      <div className="tabs">
        {["admins", "activity"].map((t) => (
          <button key={t} className={`tab${tab === t ? " active" : ""}`} onClick={() => setTab(t)}>
            {t === "admins" ? "👥 Admins" : "📜 Activity"}
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
    </div>
  );
}
