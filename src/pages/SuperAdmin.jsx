import { useEffect, useMemo, useState } from "react";
import { useMe } from "../lib/me-context.jsx";
import { api } from "../lib/api.js";
import { fmtUsd, centsToUsd } from "../lib/money.js";
import usePageMeta from "../lib/usePageMeta.js";
import SolarMap from "../components/SolarMap.jsx";
import SuperAdminOps from "../components/SuperAdminOps.jsx";

// Sol's command center. The sun in the middle, the ecosystems (income
// streams) on its tendrils, the money each one brings in, the goals Sol and
// Ray share, and Ray's notes back. Game-flavored on purpose: HUD panels,
// XP bars, a level — Sol's safe haven.

const ECO_STATUSES = ["seed", "building", "live", "paused", "closed"];
const STATUS_BADGE = {
  seed: "badge",
  building: "badge badge-gold",
  live: "badge badge-green",
  paused: "badge",
  closed: "badge badge-red",
};
const NOTE_ICON = { briefing: "☀️", advice: "💡", alert: "⚠️", win: "🏆" };

// Level = f(lifetime income). Each level needs more than the last:
// threshold(L) = 250 · L² dollars. Level 1 at $0, 2 at $1,000, 3 at $2,250 …
function levelFor(lifetimeCents) {
  const dollars = Math.max(0, lifetimeCents) / 100;
  let L = 1;
  while (dollars >= 250 * (L + 1) * (L + 1)) L++;
  const cur = 250 * L * L;
  const next = 250 * (L + 1) * (L + 1);
  return { level: L, pct: Math.min(100, Math.round(((dollars - cur) / (next - cur)) * 100)), next };
}

function Stat({ label, value, tone, sub }) {
  return (
    <div className={`hud-stat${tone ? ` ${tone}` : ""}`}>
      <div className="hud-stat-label">{label}</div>
      <div className="hud-stat-value">{value}</div>
      {sub && <div className="hud-stat-sub">{sub}</div>}
    </div>
  );
}

const fmtMetric = (m) => {
  if (m.unit === "usd") return fmtUsd(Math.round(m.value * 100));
  if (m.unit === "days") return `${m.value} d`;
  if (m.unit && m.unit !== "count") return `${Number(m.value).toLocaleString(undefined, { maximumFractionDigits: 4 })} ${m.unit}`;
  return Number(m.value).toLocaleString();
};
const SOURCE_LABEL = { stripe: "Stripe", pound: "poundplay.com", chain: "On-chain", cloudflare: "Cloudflare" };

// Live signals: what Ray pulled from outside (hubsync). Grouped by source.
function Signals({ metrics, compact = false }) {
  if (!metrics?.length) {
    return compact ? null : (
      <div className="empty">No live signals yet. Ray's hourly sync fills this once the token is set.</div>
    );
  }
  const bySource = {};
  for (const m of metrics) (bySource[m.source] = bySource[m.source] || []).push(m);
  const stale = (m) => Date.now() - Date.parse(m.updatedAt) > 3 * 60 * 60 * 1000;
  return (
    <div className="signals">
      {Object.entries(bySource).map(([src, list]) => (
        <div key={src} className="signal-group">
          <div className="hud-sub" style={{ margin: "0 0 6px" }}>
            {SOURCE_LABEL[src] || src}
            <span className="muted" style={{ textTransform: "none", letterSpacing: 0, marginLeft: 8 }}>
              {stale(list[0]) ? "· stale" : `· ${new Date(list[0].updatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`}
            </span>
          </div>
          <div className="signal-row">
            {list.map((m) => (
              <div key={m.key} className="signal" title={m.detail ? JSON.stringify(m.detail) : m.key}>
                <span className="signal-value mono">{fmtMetric(m)}</span>
                <span className="signal-label">{m.label}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function XpBar({ pct, color, label }) {
  return (
    <div className="xp" title={label}>
      <div className="xp-fill" style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: color }} />
    </div>
  );
}

// ── Ecosystems ──────────────────────────────────────────────────────────────

const emptyEco = { id: null, name: "", slug: "", tagline: "", status: "building", color: "#ff6b1a", url: "", monthlyTarget: "", notes: "", sortOrder: 0 };

function EcosystemPanel({ hub, selected, onSelect, reload, setErr }) {
  const [form, setForm] = useState(null);
  const [income, setIncome] = useState({ amount: "", occurredOn: new Date().toISOString().slice(0, 10), source: "", note: "" });
  const [busy, setBusy] = useState(false);
  const eco = hub.ecosystems.find((e) => e.id === selected) || null;
  const entries = hub.income.filter((i) => !eco || i.ecosystemId === eco.id);

  const edit = (e) =>
    setForm(
      e
        ? { id: e.id, name: e.name, slug: e.slug, tagline: e.tagline || "", status: e.status, color: e.color, url: e.url || "", monthlyTarget: e.monthlyTargetCents ? centsToUsd(e.monthlyTargetCents) : "", notes: e.notes || "", sortOrder: e.sortOrder }
        : { ...emptyEco, sortOrder: hub.ecosystems.length }
    );

  async function save(e) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const r = await api.hubSaveEcosystem(form);
      setForm(null);
      await reload();
      onSelect(r.id);
    } catch (e2) {
      setErr(e2.message);
    }
    setBusy(false);
  }

  async function addIncome(e) {
    e.preventDefault();
    if (!eco) return;
    setErr("");
    setBusy(true);
    try {
      await api.hubAddIncome({ ecosystemId: eco.id, ...income });
      setIncome((p) => ({ ...p, amount: "", note: "" }));
      await reload();
    } catch (e2) {
      setErr(e2.message);
    }
    setBusy(false);
  }

  async function del(e) {
    if (!window.confirm(`Delete ${e.name}?`)) return;
    try {
      await api.hubDeleteEcosystem(e.id);
      onSelect(null);
      await reload();
    } catch (e2) {
      setErr(e2.message);
    }
  }

  return (
    <div className="hub-grid">
      <div className="hud">
        <div className="spread">
          <h3 className="hud-title">Ecosystems</h3>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => edit(null)}>+ New</button>
        </div>
        <div className="eco-list">
          {hub.ecosystems.map((e) => {
            const pct = e.monthlyTargetCents > 0 ? Math.round((e.monthCents / e.monthlyTargetCents) * 100) : null;
            return (
              <button type="button" key={e.id} className={`eco-row${selected === e.id ? " active" : ""}`} onClick={() => onSelect(e.id)}>
                <span className="eco-dot" style={{ background: e.color }} />
                <span className="eco-row-main">
                  <span className="eco-row-name">{e.name} <span className={STATUS_BADGE[e.status]}>{e.status}</span></span>
                  <span className="muted eco-row-sub">{e.tagline || "—"}</span>
                  {pct !== null && <XpBar pct={pct} color={e.color} label={`${pct}% of monthly target`} />}
                </span>
                <span className="eco-row-money mono">
                  {fmtUsd(e.monthCents)}
                  <span className="muted">this month</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="hud">
        {form ? (
          <form onSubmit={save}>
            <h3 className="hud-title">{form.id ? `Edit ${form.name}` : "New ecosystem"}</h3>
            <div className="form-field"><label>Name</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required maxLength={60} /></div>
            <div className="form-field"><label>Tagline</label><input value={form.tagline} onChange={(e) => setForm({ ...form, tagline: e.target.value })} maxLength={140} /></div>
            <div className="row">
              <div className="form-field" style={{ flex: 1 }}>
                <label>Status</label>
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  {ECO_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="form-field"><label>Color</label><input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} /></div>
              <div className="form-field" style={{ flex: 1 }}><label>Monthly target ($)</label><input inputMode="decimal" value={form.monthlyTarget} onChange={(e) => setForm({ ...form, monthlyTarget: e.target.value })} placeholder="2000.00" /></div>
            </div>
            <div className="form-field"><label>URL</label><input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://…" /></div>
            <div className="form-field"><label>Notes (for you and Ray)</label><textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} maxLength={2000} /></div>
            <div className="row">
              <button className="btn btn-gold btn-sm" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setForm(null)}>Cancel</button>
            </div>
          </form>
        ) : eco ? (
          <>
            <div className="spread">
              <h3 className="hud-title" style={{ color: eco.color }}>{eco.name}</h3>
              <div className="row" style={{ gap: 6 }}>
                {eco.url && <a className="btn btn-ghost btn-sm" href={eco.url} target="_blank" rel="noreferrer">Open ↗</a>}
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => edit(eco)}>Edit</button>
                <button type="button" className="btn btn-danger btn-sm" onClick={() => del(eco)}>Delete</button>
              </div>
            </div>
            {eco.tagline && <p className="muted" style={{ marginTop: 4 }}>{eco.tagline}</p>}
            <div className="hud-stats" style={{ marginBottom: 12 }}>
              <Stat label="This month" value={fmtUsd(eco.monthCents)} sub={eco.monthlyTargetCents ? `target ${fmtUsd(eco.monthlyTargetCents)}` : "no target set"} />
              <Stat label="Last 30 days" value={fmtUsd(eco.last30Cents)} />
              <Stat label="Lifetime" value={fmtUsd(eco.lifetimeCents)} sub={eco.lastIncomeOn ? `last ${eco.lastIncomeOn}` : "nothing logged"} />
            </div>
            {eco.notes && <div className="scan-text" style={{ marginBottom: 12 }}>{eco.notes}</div>}
            <Signals metrics={hub.metrics.filter((m) => m.ecosystemId === eco.id)} compact />

            <form onSubmit={addIncome} className="income-form">
              <strong>Log money</strong>
              <div className="row">
                <input inputMode="decimal" placeholder="Amount (−40.00 = expense)" value={income.amount} onChange={(e) => setIncome({ ...income, amount: e.target.value })} required style={{ flex: 1, minWidth: 140 }} />
                <input type="date" value={income.occurredOn} onChange={(e) => setIncome({ ...income, occurredOn: e.target.value })} />
              </div>
              <div className="row">
                <input placeholder="Source (door, stripe, cash…)" value={income.source} onChange={(e) => setIncome({ ...income, source: e.target.value })} style={{ flex: 1, minWidth: 120 }} maxLength={60} />
                <input placeholder="Note" value={income.note} onChange={(e) => setIncome({ ...income, note: e.target.value })} style={{ flex: 2, minWidth: 160 }} maxLength={300} />
                <button className="btn btn-gold btn-sm" disabled={busy}>Add</button>
              </div>
            </form>
          </>
        ) : (
          <div className="empty">Pick an ecosystem on the map or in the list.</div>
        )}

        <h4 className="hud-sub">Recent entries{eco ? ` · ${eco.name}` : ""}</h4>
        {!entries.length ? (
          <div className="muted" style={{ fontSize: "0.9rem" }}>Nothing logged yet.</div>
        ) : (
          <table className="list hub-table">
            <tbody>
              {entries.slice(0, 15).map((i) => (
                <tr key={i.id}>
                  <td className="muted mono" style={{ whiteSpace: "nowrap" }}>{i.occurredOn}</td>
                  <td><span className="eco-dot" style={{ background: i.color, marginRight: 6 }} />{i.ecosystemName}{i.source ? <span className="muted"> · {i.source}</span> : ""}{i.note ? <div className="muted" style={{ fontSize: "0.8rem" }}>{i.note}</div> : null}</td>
                  <td className={`mono ${i.amountCents < 0 ? "red" : "green"}`} style={{ textAlign: "right", whiteSpace: "nowrap" }}>{i.amountCents < 0 ? "−" : "+"}{fmtUsd(Math.abs(i.amountCents))}</td>
                  <td>
                    {i.externalId ? (
                      <span className="muted" title={`Imported from ${i.source} (${i.externalId}) — re-syncs would bring it back`} style={{ fontSize: "0.8rem" }}>🔒</span>
                    ) : (
                      <button type="button" className="link-btn muted" style={{ fontSize: "0.8rem" }} onClick={() => window.confirm("Delete this entry?") && api.hubDeleteIncome(i.id).then(reload).catch((e) => setErr(e.message))}>✕</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── Goals ───────────────────────────────────────────────────────────────────

const emptyGoal = { id: null, title: "", detail: "", ecosystemId: "", target: "", progress: "", progressPct: 0, targetDate: "", owner: "both", status: "active" };

function GoalsPanel({ hub, reload, setErr }) {
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const goals = hub.goals.filter((g) => showDone || g.status === "active");

  const edit = (g) =>
    setForm(
      g
        ? { id: g.id, title: g.title, detail: g.detail || "", ecosystemId: g.ecosystemId || "", target: g.targetCents ? centsToUsd(g.targetCents) : "", progress: g.progressCents ? centsToUsd(g.progressCents) : "", progressPct: g.progressPct, targetDate: g.targetDate || "", owner: g.owner, status: g.status }
        : { ...emptyGoal }
    );

  async function save(e) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      await api.hubSaveGoal(form);
      setForm(null);
      await reload();
    } catch (e2) {
      setErr(e2.message);
    }
    setBusy(false);
  }

  async function quick(g, patch) {
    try {
      await api.hubSaveGoal({ id: g.id, title: g.title, detail: g.detail, ecosystemId: g.ecosystemId, target: g.targetCents ? centsToUsd(g.targetCents) : "", progress: g.progressCents ? centsToUsd(g.progressCents) : "", progressPct: g.progressPct, targetDate: g.targetDate, owner: g.owner, status: g.status, ...patch });
      await reload();
    } catch (e2) {
      setErr(e2.message);
    }
  }

  return (
    <div className="hub-grid">
      <div className="hud">
        <div className="spread">
          <h3 className="hud-title">Shared goals</h3>
          <div className="row" style={{ gap: 6 }}>
            <label className="muted" style={{ fontSize: "0.85rem" }}><input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> show finished</label>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => edit(null)}>+ Goal</button>
          </div>
        </div>
        {!goals.length ? (
          <div className="empty">No goals yet. Set one — Ray reads them.</div>
        ) : (
          <div className="stack">
            {goals.map((g) => {
              const pct = g.targetCents ? Math.min(100, Math.round((g.progressCents / g.targetCents) * 100)) : g.progressPct;
              const eco = hub.ecosystems.find((e) => e.id === g.ecosystemId);
              return (
                <div key={g.id} className={`goal${g.status !== "active" ? " done" : ""}`}>
                  <div className="spread">
                    <div>
                      <strong>{g.title}</strong>{" "}
                      <span className="badge">{g.owner === "both" ? "Sol + Ray" : g.owner === "ray" ? "Ray" : "Sol"}</span>
                      {eco && <span className="badge" style={{ color: eco.color, marginLeft: 4 }}>{eco.name}</span>}
                      {g.targetDate && <span className="muted" style={{ fontSize: "0.82rem", marginLeft: 6 }}>by {g.targetDate}</span>}
                    </div>
                    <div className="row" style={{ gap: 4 }}>
                      {g.status === "active" && <button type="button" className="btn btn-green btn-sm" onClick={() => quick(g, { status: "done", progressPct: 100 })}>Done ✓</button>}
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => edit(g)}>Edit</button>
                    </div>
                  </div>
                  {g.detail && <p className="muted" style={{ margin: "4px 0", fontSize: "0.9rem" }}>{g.detail}</p>}
                  <div className="row" style={{ gap: 10 }}>
                    <XpBar pct={pct} color={eco?.color || "var(--gold)"} label={`${pct}%`} />
                    <span className="mono" style={{ fontSize: "0.85rem", minWidth: 120, textAlign: "right" }}>
                      {g.targetCents ? `${fmtUsd(g.progressCents)} / ${fmtUsd(g.targetCents)}` : `${pct}%`}
                    </span>
                  </div>
                  {g.rayNote && (
                    <div className="ray-inline">
                      <span className="ray-tag">Ray</span> {g.rayNote}
                      {g.rayNoteAt && <span className="muted"> · {new Date(g.rayNoteAt).toLocaleDateString()}</span>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div className="hud">
        {form ? (
          <form onSubmit={save}>
            <h3 className="hud-title">{form.id ? "Edit goal" : "New goal"}</h3>
            <div className="form-field"><label>Title</label><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required maxLength={140} /></div>
            <div className="form-field"><label>Detail</label><textarea rows={3} value={form.detail} onChange={(e) => setForm({ ...form, detail: e.target.value })} maxLength={2000} /></div>
            <div className="row">
              <div className="form-field" style={{ flex: 1 }}>
                <label>Ecosystem</label>
                <select value={form.ecosystemId} onChange={(e) => setForm({ ...form, ecosystemId: e.target.value })}>
                  <option value="">— none —</option>
                  {hub.ecosystems.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>
              <div className="form-field" style={{ flex: 1 }}>
                <label>Owner</label>
                <select value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })}>
                  <option value="both">Sol + Ray</option><option value="sol">Sol</option><option value="ray">Ray</option>
                </select>
              </div>
            </div>
            <div className="row">
              <div className="form-field" style={{ flex: 1 }}><label>Money target ($)</label><input inputMode="decimal" value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} placeholder="optional" /></div>
              <div className="form-field" style={{ flex: 1 }}><label>Progress ($)</label><input inputMode="decimal" value={form.progress} onChange={(e) => setForm({ ...form, progress: e.target.value })} placeholder="0.00" /></div>
              <div className="form-field" style={{ flex: 1 }}><label>Progress %</label><input type="number" min={0} max={100} value={form.progressPct} onChange={(e) => setForm({ ...form, progressPct: e.target.value })} /></div>
            </div>
            <div className="row">
              <div className="form-field" style={{ flex: 1 }}><label>Target date</label><input type="date" value={form.targetDate} onChange={(e) => setForm({ ...form, targetDate: e.target.value })} /></div>
              <div className="form-field" style={{ flex: 1 }}>
                <label>Status</label>
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  <option value="active">active</option><option value="done">done</option><option value="dropped">dropped</option>
                </select>
              </div>
            </div>
            <div className="row">
              <button className="btn btn-gold btn-sm" disabled={busy}>{busy ? "Saving…" : "Save goal"}</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setForm(null)}>Cancel</button>
              {form.id && <button type="button" className="btn btn-danger btn-sm" onClick={() => window.confirm("Delete this goal?") && api.hubDeleteGoal(form.id).then(() => { setForm(null); reload(); }).catch((e) => setErr(e.message))}>Delete</button>}
            </div>
          </form>
        ) : (
          <>
            <h3 className="hud-title">How this works</h3>
            <p className="muted" style={{ fontSize: "0.92rem" }}>
              Goals live here for both of you. Ray reads them (with the ecosystem numbers) on its daily pass, leaves a note on each one, and can nudge the percent. Money goals fill from the dollar progress you log; everything else uses the percent.
            </p>
            <p className="muted" style={{ fontSize: "0.92rem" }}>Ray never changes money, statuses, or anything a member sees. You keep the pen.</p>
          </>
        )}
      </div>
    </div>
  );
}

// ── Ray's notes ─────────────────────────────────────────────────────────────

function RayPanel({ hub, reload, setErr }) {
  const notes = hub.notes;
  const unread = notes.filter((n) => !n.readAt).length;
  async function act(payload) {
    try {
      await api.hubNoteAction(payload);
      await reload();
    } catch (e) {
      setErr(e.message);
    }
  }
  return (
    <div className="hud ray-hud">
      <div className="spread">
        <h3 className="hud-title"><span className="ray-orb" /> Ray</h3>
        <div className="row" style={{ gap: 6 }}>
          {unread > 0 && <span className="badge badge-cyan">{unread} new</span>}
          {unread > 0 && <button type="button" className="btn btn-ghost btn-sm" onClick={() => act({ action: "read_all" })}>Mark all read</button>}
        </div>
      </div>
      {!notes.length ? (
        <div className="empty">
          Nothing from Ray yet. Ray's daily pass reads the hub and leaves a briefing here once the shared token is set.
        </div>
      ) : (
        <div className="stack">
          {notes.map((n) => (
            <div key={n.id} className={`ray-note${n.readAt ? "" : " unread"} kind-${n.kind}`} onClick={() => !n.readAt && act({ id: n.id, action: "read" })}>
              <div className="spread">
                <strong>{NOTE_ICON[n.kind] || "•"} {n.title}</strong>
                <span className="muted" style={{ fontSize: "0.8rem" }}>
                  {new Date(n.createdAt).toLocaleString()}{n.model ? ` · ${n.model}` : ""}
                </span>
              </div>
              <p style={{ margin: "6px 0 4px", whiteSpace: "pre-wrap" }}>{n.body}</p>
              <div className="row" style={{ gap: 6 }}>
                {n.ecosystemName && <span className="badge">{n.ecosystemName}</span>}
                {n.goalTitle && <span className="badge">goal: {n.goalTitle}</span>}
                <button type="button" className="link-btn muted" style={{ fontSize: "0.8rem", marginLeft: "auto" }} onClick={(e) => { e.stopPropagation(); act({ id: n.id, action: "dismiss" }); }}>dismiss</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── The page ────────────────────────────────────────────────────────────────

const TABS = [
  ["overview", "☀️ Overview"],
  ["ecosystems", "🪐 Ecosystems"],
  ["goals", "🎯 Goals"],
  ["ray", "🤖 Ray"],
  ["ops", "🛠 Ops"],
];

export default function SuperAdmin() {
  usePageMeta({ title: "Command Center" });
  const { me } = useMe();
  const [tab, setTab] = useState("overview");
  const [hub, setHub] = useState(null);
  const [selected, setSelected] = useState(null);
  const [err, setErr] = useState("");

  const reload = () => api.hub().then(setHub).catch((e) => setErr(e.message));
  useEffect(() => {
    reload();
  }, []);

  const lvl = useMemo(() => levelFor(hub?.totals?.lifetimeCents || 0), [hub]);
  const unread = hub?.notes?.filter((n) => !n.readAt).length || 0;

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
    <div className="page hub">
      <div className="hub-head">
        <div>
          <div className="lp-eyebrow">Command center</div>
          <h1 style={{ margin: 0 }}>Welcome home, Sol.</h1>
        </div>
        <div className="level-card">
          <div className="level-num">LV {lvl.level}</div>
          <div style={{ flex: 1 }}>
            <XpBar pct={lvl.pct} color="linear-gradient(90deg, var(--ember), var(--gold))" label="XP" />
            <div className="muted" style={{ fontSize: "0.78rem", marginTop: 4 }}>
              {hub ? `${fmtUsd(hub.totals.lifetimeCents)} lifetime · next level at $${lvl.next.toLocaleString()}` : "…"}
            </div>
          </div>
        </div>
      </div>

      <div className="tabs">
        {TABS.map(([k, label]) => (
          <button key={k} className={`tab${tab === k ? " active" : ""}`} onClick={() => setTab(k)}>
            {label}
            {k === "ray" && unread > 0 && <span className="tab-badge">{unread}</span>}
          </button>
        ))}
      </div>
      {err && <div className="form-result error">{err}</div>}

      {!hub ? (
        <div className="spinner">Powering up…</div>
      ) : (
        <>
          {tab === "overview" && (
            <>
              <div className="hud-stats">
                <Stat label="This month" value={fmtUsd(hub.totals.monthCents)} tone="gold" sub={hub.totals.targetCents ? `${Math.round((hub.totals.monthCents / hub.totals.targetCents) * 100)}% of ${fmtUsd(hub.totals.targetCents)}` : "set monthly targets"} />
                <Stat label="Last 30 days" value={fmtUsd(hub.totals.last30Cents)} />
                <Stat label="Owed to you" value={fmtUsd(hub.stats.owedToSolCents)} tone="green" sub="members' open balances" />
                <Stat label="You owe" value={fmtUsd(hub.stats.solOwesCents)} tone={hub.stats.solOwesCents ? "red" : ""} sub={`${hub.stats.reimbSubmitted} to approve · ${hub.stats.reimbApproved} to pay`} />
                <Stat label="Members" value={hub.stats.members} sub={`${hub.stats.applied} applied · ${hub.stats.waitlistNew} on the waitlist`} />
                <Stat label="Scanner" value={hub.stats.receiptsScanning} sub="receipts in Ray's queue" />
              </div>
              {hub.metrics.length > 0 && (
                <div className="hud" style={{ marginBottom: 14 }}>
                  <h3 className="hud-title">Live signals</h3>
                  <Signals metrics={hub.metrics} />
                </div>
              )}
              <div className="hub-grid overview">
                <div className="hud map-hud">
                  <SolarMap ecosystems={hub.ecosystems} selectedId={selected} onSelect={(e) => { setSelected(e.id); setTab("ecosystems"); }} />
                  <p className="muted map-caption">The sun powers every tendril. POUND was the first; more to come.</p>
                </div>
                <RayPanel hub={{ ...hub, notes: hub.notes.slice(0, 5) }} reload={reload} setErr={setErr} />
              </div>
            </>
          )}
          {tab === "ecosystems" && <EcosystemPanel hub={hub} selected={selected} onSelect={setSelected} reload={reload} setErr={setErr} />}
          {tab === "goals" && <GoalsPanel hub={hub} reload={reload} setErr={setErr} />}
          {tab === "ray" && <RayPanel hub={hub} reload={reload} setErr={setErr} />}
          {tab === "ops" && <SuperAdminOps />}
        </>
      )}
    </div>
  );
}
