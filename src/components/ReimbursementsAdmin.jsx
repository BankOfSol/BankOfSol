import { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { fmtUsd } from "../lib/money.js";

// Admin reimbursement desk: review receipts + the scanner's read, approve or
// reject, then pay out by the member's chosen rail. Every payout (cash
// included) is an explicit click here — nothing moves money on its own.
// Approval books −total on the member's ledger; "Mark paid" / the Stripe
// transfer books +total.

const FILTERS = [
  ["submitted", "Awaiting approval"],
  ["approved", "Approved · to pay"],
  ["paid", "Paid"],
  ["rejected", "Rejected"],
  ["all", "All"],
];
const STATUS_BADGE = {
  submitted: <span className="badge badge-gold">awaiting approval</span>,
  approved: <span className="badge badge-green">approved · unpaid</span>,
  paid: <span className="badge badge-green">paid</span>,
  rejected: <span className="badge badge-red">rejected</span>,
};
const PAY_METHODS = ["stripe", "XRP", "SOL", "BTC", "TON", "telegram", "cash", "other"];

function PayoutDetails({ p }) {
  if (!p) return <span className="muted">—</span>;
  if (p.method === "stripe")
    return (
      <span>
        Stripe → bank{" "}
        <span className="mono muted" style={{ fontSize: "0.8rem" }}>{p.stripeAccountId}</span>
        {!p.onboarded && <span className="badge badge-red" style={{ marginLeft: 6 }}>onboarding incomplete</span>}
      </span>
    );
  if (p.method === "crypto")
    return (
      <span>
        <strong>{p.chain}</strong>{" "}
        <span className="mono" style={{ fontSize: "0.82rem", wordBreak: "break-all" }}>{p.address}</span>
        {p.tag && <span className="muted"> · tag/memo {p.tag}</span>}
      </span>
    );
  if (p.method === "telegram")
    return (
      <span>
        Telegram Wallet <strong>@{p.handle}</strong>
        {p.tonAddress && (
          <>
            {" "}· TON <span className="mono" style={{ fontSize: "0.82rem", wordBreak: "break-all" }}>{p.tonAddress}</span>
          </>
        )}
      </span>
    );
  return <span>Cash{p.note ? ` — ${p.note}` : ""}</span>;
}

function Row({ x, onChanged }) {
  const [note, setNote] = useState("");
  const [paidMethod, setPaidMethod] = useState(x.payout?.method === "crypto" ? x.payout.chain : x.payout?.method || "cash");
  const [paidRef, setPaidRef] = useState("");
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [open, setOpen] = useState(x.status === "submitted");

  async function act(action, extra = {}) {
    if (action === "reject" && !window.confirm(`Reject ${x.refCode}?`)) return;
    if (action === "approve" && !window.confirm(`Approve ${x.refCode} for ${fmtUsd(x.totalCents)}? This books it on the ledger.`)) return;
    if (action === "stripe_transfer" && !window.confirm(`Send ${fmtUsd(x.totalCents)} to this member's Stripe account now?`)) return;
    if (action === "paid" && !window.confirm(`Mark ${x.refCode} as paid (${paidMethod})?`)) return;
    setErr("");
    setBusy(action);
    try {
      await api.adminReimbursementAction({ id: x.id, action, adminNote: note || undefined, ...extra });
      onChanged();
    } catch (e) {
      setErr(e.message);
    }
    setBusy("");
  }

  return (
    <div className="card">
      <div className="spread">
        <div>
          <strong>{x.title}</strong>{" "}
          <span className="muted mono" style={{ fontSize: "0.8rem" }}>{x.refCode}</span>
          <br />
          <span className="muted" style={{ fontSize: "0.9rem" }}>
            {x.name || x.email} · {new Date(x.createdAt).toLocaleDateString()} · {x.receipts.length} receipt{x.receipts.length === 1 ? "" : "s"}
          </span>
        </div>
        <div className="row">
          <span className="mono gold" style={{ fontWeight: 800 }}>{fmtUsd(x.totalCents)}</span>
          {STATUS_BADGE[x.status]}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen((v) => !v)}>
            {open ? "Hide" : "Review"}
          </button>
        </div>
      </div>

      {open && (
        <>
          {x.note && <p className="muted" style={{ margin: "8px 0 0" }}>Member note: {x.note}</p>}
          <div className="kv" style={{ marginTop: 6 }}>
            <span className="k">Payout</span>
            <span className="v" style={{ fontWeight: 500, textAlign: "left" }}><PayoutDetails p={x.payout} /></span>
          </div>

          <div className="table-wrap" style={{ marginTop: 8 }}>
            <table className="list">
              <thead>
                <tr>
                  <th>Receipt</th>
                  <th>Merchant</th>
                  <th>Date</th>
                  <th>Scan</th>
                  <th style={{ textAlign: "right" }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {x.receipts.map((r) => {
                  const scanTotal = r.scan?.totalCents;
                  const differs = scanTotal != null && r.totalCents != null && scanTotal !== r.totalCents;
                  return (
                    <tr key={r.id}>
                      <td>
                        <a href={r.fileUrl} target="_blank" rel="noreferrer">
                          <img className="receipt-thumb-sm" src={r.fileUrl} alt="" loading="lazy" />
                        </a>
                      </td>
                      <td>
                        {r.merchant || <span className="muted">—</span>}
                        {r.note && <div className="muted" style={{ fontSize: "0.82rem" }}>{r.note}</div>}
                      </td>
                      <td className="muted">{r.purchaseDate || "—"}</td>
                      <td style={{ fontSize: "0.82rem" }}>
                        {r.status === "scanned" ? (
                          <span className="green" title={r.scanModel}>
                            ✓ {r.scan?.merchant || "?"} · {scanTotal != null ? fmtUsd(scanTotal) : "no total"}
                          </span>
                        ) : (
                          <span className="muted">{r.status}</span>
                        )}
                        {differs && <div className="red">member changed the total</div>}
                      </td>
                      <td className="mono" style={{ textAlign: "right" }}>{r.totalCents != null ? fmtUsd(r.totalCents) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {x.adminNote && <p className="muted" style={{ margin: "8px 0 0", fontSize: "0.9rem" }}>Admin note: {x.adminNote}</p>}
          {x.status === "paid" && (
            <p className="muted" style={{ margin: "8px 0 0", fontSize: "0.9rem", wordBreak: "break-all" }}>
              Paid {x.paidAt ? new Date(x.paidAt).toLocaleString() : ""} by {x.paidBy} via {x.paidMethod}
              {x.paidRef ? ` · ${x.paidRef}` : ""}
            </p>
          )}
          {err && <div className="form-result error">{err}</div>}

          {x.status === "submitted" && (
            <div style={{ marginTop: 10 }}>
              <div className="form-field">
                <label>Note to the member (optional)</label>
                <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
              </div>
              <div className="row">
                <button type="button" className="btn btn-green" onClick={() => act("approve")} disabled={!!busy}>
                  {busy === "approve" ? "…" : `Approve ${fmtUsd(x.totalCents)}`}
                </button>
                <button type="button" className="btn btn-danger" onClick={() => act("reject")} disabled={!!busy}>
                  Reject
                </button>
              </div>
            </div>
          )}

          {x.status === "approved" && (
            <div style={{ marginTop: 10 }}>
              {x.payout?.method === "stripe" && (
                <div className="row" style={{ marginBottom: 12 }}>
                  <button type="button" className="btn btn-gold" onClick={() => act("stripe_transfer")} disabled={!!busy || !x.payout.onboarded}>
                    {busy === "stripe_transfer" ? "Sending…" : `Send ${fmtUsd(x.totalCents)} via Stripe`}
                  </button>
                  {!x.payout.onboarded && <span className="muted">Member hasn't finished Stripe onboarding.</span>}
                </div>
              )}
              <p className="muted" style={{ fontSize: "0.9rem", margin: "0 0 6px" }}>
                Sent it yourself (wallet, Telegram, cash)? Record it here — this books the payout on the ledger.
              </p>
              <div className="row">
                <select value={paidMethod} onChange={(e) => setPaidMethod(e.target.value)} style={{ width: "auto" }}>
                  {PAY_METHODS.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
                <input
                  value={paidRef}
                  onChange={(e) => setPaidRef(e.target.value)}
                  placeholder={paidMethod === "cash" ? "optional: where/when" : "tx hash / transfer id"}
                  maxLength={200}
                  style={{ flex: 1, minWidth: 200 }}
                />
                <button type="button" className="btn btn-gold" onClick={() => act("paid", { paidMethod, paidRef })} disabled={!!busy}>
                  {busy === "paid" ? "…" : "Mark paid"}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function ReimbursementsAdmin({ onChanged }) {
  const [filter, setFilter] = useState("submitted");
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");

  const load = () =>
    api
      .adminReimbursements(filter)
      .then((d) => setRows(d.reimbursements || []))
      .catch((e) => setErr(e.message));
  useEffect(() => {
    setRows(null);
    load();
  }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps

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
        <div className="empty">Nothing here.</div>
      ) : (
        <div className="stack">
          {rows.map((x) => (
            <Row
              key={x.id}
              x={x}
              onChanged={() => {
                load();
                onChanged?.();
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
