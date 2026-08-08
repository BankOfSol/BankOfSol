import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api.js";
import { fmtUsd } from "../lib/money.js";
import usePageMeta from "../lib/usePageMeta.js";
import ReviewSheet from "../components/ReviewSheet.jsx";

// Member billing: balance, open invoices (card or crypto), the itemized
// ledger, loans, engagements, and review prompts. Ledger amounts are SIGNED:
// positive = the member owes Sol more, negative = credit toward Sol.

const KIND_LABELS = {
  invoice: "Invoice",
  payment: "Payment",
  loan_disbursement: "Loan disbursed",
  loan_due: "Loan payment due",
  loan_payment: "Loan payment",
  adjustment: "Adjustment",
  refund: "Refund",
};

function BalanceChip({ cents }) {
  if (cents > 0) return <span className="badge badge-red">Owes {fmtUsd(cents)}</span>;
  if (cents < 0) return <span className="badge badge-green">{fmtUsd(-cents)} credit</span>;
  return <span className="badge">Settled</span>;
}

function LedgerAmount({ entry }) {
  if (entry.kind === "loan_due") return <span className="muted">—</span>;
  if (entry.amountCents < 0)
    return <span className="mono green">−{fmtUsd(-entry.amountCents)}</span>;
  return <span className="mono">{fmtUsd(entry.amountCents)}</span>;
}

function LedgerTable({ entries }) {
  if (!entries?.length) return <div className="empty">Nothing on the ledger yet.</div>;
  return (
    <div className="table-wrap">
      <table className="list">
        <thead>
          <tr>
            <th>Date</th>
            <th>What</th>
            <th>Method</th>
            <th>Reference</th>
            <th style={{ textAlign: "right" }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e, i) => (
            <tr key={e.id || i}>
              <td className="muted" style={{ whiteSpace: "nowrap" }}>
                {e.entryDate ? new Date(e.entryDate).toLocaleDateString() : "—"}
              </td>
              <td>
                <strong>{KIND_LABELS[e.kind] || e.kind}</strong>
                {e.note && (
                  <>
                    <br />
                    <span className="muted" style={{ fontSize: "0.84rem" }}>{e.note}</span>
                  </>
                )}
              </td>
              <td className="muted">{e.method || "—"}</td>
              <td>
                {e.reference ? (
                  <span
                    className="mono muted"
                    title={e.reference}
                    style={{
                      display: "inline-block",
                      maxWidth: 140,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      verticalAlign: "bottom",
                      fontSize: "0.8rem",
                    }}
                  >
                    {e.reference}
                  </span>
                ) : (
                  <span className="muted">—</span>
                )}
              </td>
              <td style={{ textAlign: "right" }}>
                <LedgerAmount entry={e} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// "Pay with crypto": pick a chain, copy the PUBLIC receiving address (+ tag),
// then file an "I sent it" claim that Sol verifies on-chain.
function CryptoPaySheet({ invoice, rails, onClose, onFiled }) {
  const [rail, setRail] = useState(rails.length === 1 ? rails[0] : null);
  const [copied, setCopied] = useState("");
  const [txRef, setTxRef] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);

  const remaining = invoice.totalCents - (invoice.paidCents || 0);

  function copy(text, which) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(which);
      setTimeout(() => setCopied(""), 1600);
    });
  }

  async function fileClaim(e) {
    e.preventDefault();
    if (!rail || !txRef.trim()) {
      setErr("Paste the transaction hash or a link to it.");
      return;
    }
    setErr("");
    setBusy(true);
    try {
      await api.claimInvoice(invoice.id, {
        chain: rail.chain,
        txRef: txRef.trim(),
        note: note || undefined,
      });
      setDone(true);
    } catch (e2) {
      setErr(e2.message || "Couldn't file the claim");
      setBusy(false);
    }
  }

  return (
    <div className="sheet-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h3>Pay with crypto</h3>
        <div className="kv">
          <span className="k">{invoice.title}</span>
          <span className="v mono">{fmtUsd(remaining)} remaining</span>
        </div>

        {done ? (
          <>
            <div className="form-result success">
              Claim filed — Sol verifies on-chain and your ledger updates.
            </div>
            <div className="sheet-actions">
              <button type="button" className="btn btn-gold" onClick={onFiled}>
                Done
              </button>
            </div>
          </>
        ) : !rails.length ? (
          <>
            <div className="empty">No crypto payment rails are set up yet — pay by card, or ask Sol.</div>
            <div className="sheet-actions">
              <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
                Close
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="form-field">
              <label>Chain</label>
              <div className="row">
                {rails.map((r) => (
                  <button
                    key={r.chain + r.address}
                    type="button"
                    className={`btn btn-sm ${rail === r ? "btn-gold" : "btn-ghost"}`}
                    onClick={() => setRail(r)}
                  >
                    {r.chain}
                    {r.label ? ` · ${r.label}` : ""}
                  </button>
                ))}
              </div>
            </div>

            {rail && (
              <>
                <div className="form-field">
                  <label>Send to this {rail.chain} address</label>
                  <button
                    type="button"
                    className="copy-btn"
                    style={{ width: "100%" }}
                    onClick={() => copy(rail.address, "addr")}
                    title="Copy address"
                  >
                    {rail.address}
                  </button>
                  <span className="hint">{copied === "addr" ? "Copied ✓" : "Tap to copy"}</span>
                </div>

                {rail.tag && (
                  <div className="form-field">
                    <label>
                      {rail.chain === "TON" ? "Memo" : "Destination tag"}{" "}
                      <span className="req">*</span>
                    </label>
                    <button
                      type="button"
                      className="copy-btn"
                      style={{ width: "100%" }}
                      onClick={() => copy(rail.tag, "tag")}
                    >
                      {rail.tag}
                    </button>
                    <span className="hint">{copied === "tag" ? "Copied ✓" : "Tap to copy"}</span>
                    <div className="form-result error" style={{ marginTop: 8 }}>
                      ⚠️ You MUST include this {rail.chain === "TON" ? "memo" : "tag"} with the
                      transfer — include this tag or the payment may be lost.
                    </div>
                  </div>
                )}

                <hr className="divider" />

                <form onSubmit={fileClaim}>
                  <h3 style={{ fontSize: "1.02rem" }}>I sent it</h3>
                  <div className="form-field">
                    <label>
                      Transaction hash / link <span className="req">*</span>
                    </label>
                    <input
                      value={txRef}
                      onChange={(e) => setTxRef(e.target.value)}
                      placeholder="Tx hash or explorer link"
                      maxLength={500}
                    />
                  </div>
                  <div className="form-field">
                    <label>Note (optional)</label>
                    <input
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Anything Sol should know"
                      maxLength={500}
                    />
                  </div>

                  {err && <div className="form-result error">{err}</div>}

                  <div className="sheet-actions">
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={onClose}
                      disabled={busy}
                    >
                      Cancel
                    </button>
                    <button type="submit" className="btn btn-gold" disabled={busy}>
                      {busy ? "Filing…" : "File claim"}
                    </button>
                  </div>
                </form>
              </>
            )}
            {!rail && (
              <div className="sheet-actions">
                <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
                  Cancel
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const invoiceStatusBadge = (status) =>
  ({
    open: <span className="badge badge-gold">open</span>,
    partial: <span className="badge badge-gold">partially paid</span>,
    paid: <span className="badge badge-green">paid</span>,
    void: <span className="badge">void</span>,
  })[status] || <span className="badge">{status}</span>;

const loanStatusBadge = (status) =>
  ({
    active: <span className="badge badge-gold">active</span>,
    paid: <span className="badge badge-green">paid</span>,
    defaulted: <span className="badge badge-red">defaulted</span>,
    forgiven: <span className="badge">forgiven</span>,
    closed: <span className="badge">closed</span>,
  })[status] || <span className="badge">{status}</span>;

const engagementStatusBadge = (status) =>
  ({
    onboarding: <span className="badge badge-gold">onboarding</span>,
    active: <span className="badge badge-green">active</span>,
    paused: <span className="badge">paused</span>,
    completed: <span className="badge badge-green">completed</span>,
    closed: <span className="badge">closed</span>,
  })[status] || <span className="badge">{status}</span>;

export default function Billing() {
  usePageMeta({ title: "Billing" });
  const [data, setData] = useState(null);
  const [pending, setPending] = useState(false); // 403 = member not yet approved
  const [err, setErr] = useState("");
  const [notice, setNotice] = useState("");
  const [payBusy, setPayBusy] = useState(null);
  const [payErrs, setPayErrs] = useState({});
  const [cryptoInvoice, setCryptoInvoice] = useState(null);
  const [reviewBooking, setReviewBooking] = useState(null);

  const load = () =>
    api
      .billing()
      .then((d) => {
        setData(d);
        setPending(false);
      })
      .catch((e) => {
        if (e.status === 403) setPending(true);
        else setErr(e.message);
      });

  // Handle the Stripe return (?invoice=success&session_id=cs_… or ?invoice=cancel),
  // then strip the params so refreshes don't re-confirm.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const outcome = params.get("invoice");
    const sessionId = params.get("session_id");
    (async () => {
      if (outcome === "success" && sessionId) {
        try {
          const r = await api.billingConfirm(sessionId);
          setNotice(
            r.paid
              ? "Payment received — thank you. Your ledger is updated."
              : "Payment is processing — your ledger will update once it settles."
          );
        } catch (e) {
          setErr(e.message);
        }
        window.history.replaceState({}, "", window.location.pathname);
      } else if (outcome === "cancel") {
        setNotice("Card payment canceled — nothing was charged.");
        window.history.replaceState({}, "", window.location.pathname);
      }
      load();
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function payCard(inv) {
    setPayErrs((p) => ({ ...p, [inv.id]: "" }));
    setPayBusy(inv.id);
    try {
      const res = await api.payInvoice(inv.id);
      window.location.assign(res.url); // off to Stripe
    } catch (e) {
      // 503 = card payments not configured — the server message says so.
      setPayErrs((p) => ({ ...p, [inv.id]: e.message }));
      setPayBusy(null);
    }
  }

  if (pending) {
    return (
      <div className="page narrow">
        <div className="panel">
          <h1>Membership pending</h1>
          <p className="muted">
            Billing opens up once Sol approves your membership. Hang tight — you'll get an
            email the moment it's decided.
          </p>
          <Link className="btn btn-gold" to="/membership">
            Check your application
          </Link>
        </div>
      </div>
    );
  }

  if (err && !data) {
    return (
      <div className="page">
        <div className="form-result error">{err}</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="page">
        <div className="spinner">Loading your account…</div>
      </div>
    );
  }

  const openInvoices = (data.invoices || []).filter(
    (i) => i.status === "open" || i.status === "partial"
  );
  const rails = data.rails || [];

  return (
    <div className="page">
      <div className="spread" style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0 }}>Your account</h1>
        <BalanceChip cents={data.balance || 0} />
      </div>

      {notice && <div className="form-result success">{notice}</div>}
      {err && <div className="form-result error">{err}</div>}

      {/* ── Open invoices ── */}
      <h2>Open invoices</h2>
      {!openInvoices.length ? (
        <div className="empty">No open invoices — you're all settled here.</div>
      ) : (
        <div className="stack">
          {openInvoices.map((inv) => {
            const remaining = inv.totalCents - (inv.paidCents || 0);
            return (
              <div className="card" key={inv.id}>
                <div className="spread">
                  <h3 style={{ margin: 0 }}>
                    {inv.title} <span className="muted mono" style={{ fontSize: "0.8rem" }}>{inv.refCode}</span>
                  </h3>
                  {invoiceStatusBadge(inv.status)}
                </div>
                {inv.dueDate && (
                  <p className="muted" style={{ margin: "4px 0 0" }}>
                    Due {new Date(inv.dueDate).toLocaleDateString()}
                  </p>
                )}
                {inv.notes && <p className="muted">{inv.notes}</p>}

                <div className="table-wrap" style={{ marginTop: 10 }}>
                  <table className="list">
                    <thead>
                      <tr>
                        <th>Item</th>
                        <th>Qty</th>
                        <th>Unit</th>
                        <th style={{ textAlign: "right" }}>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(inv.items || []).map((it, i) => (
                        <tr key={i}>
                          <td>{it.description}</td>
                          <td className="mono">{it.qty}</td>
                          <td className="mono">{fmtUsd(it.unitCents)}</td>
                          <td className="mono" style={{ textAlign: "right" }}>
                            {fmtUsd(it.unitCents * it.qty)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="kv">
                  <span className="k">Total</span>
                  <span className="v mono">{fmtUsd(inv.totalCents)}</span>
                </div>
                {inv.paidCents > 0 && (
                  <div className="kv">
                    <span className="k">Paid so far</span>
                    <span className="v mono green">{fmtUsd(inv.paidCents)}</span>
                  </div>
                )}
                <div className="kv">
                  <span className="k">Remaining</span>
                  <span className="v mono gold">{fmtUsd(remaining)}</span>
                </div>

                {payErrs[inv.id] && <div className="form-result error">{payErrs[inv.id]}</div>}

                <div className="row" style={{ marginTop: 10 }}>
                  <button
                    className="btn btn-gold"
                    onClick={() => payCard(inv)}
                    disabled={payBusy === inv.id}
                  >
                    {payBusy === inv.id ? "Opening checkout…" : "Pay by card"}
                  </button>
                  <button className="btn btn-ghost" onClick={() => setCryptoInvoice(inv)}>
                    Pay with crypto
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Ledger ── */}
      <h2 style={{ marginTop: 32 }}>Itemized ledger</h2>
      <LedgerTable entries={data.entries || []} />

      {/* ── Loans ── */}
      <h2 style={{ marginTop: 32 }}>Loans</h2>
      {!(data.loans || []).length ? (
        <div className="empty">No loans on record.</div>
      ) : (
        <div className="stack">
          {data.loans.map((loan) => (
            <div className="card" key={loan.refCode}>
              <div className="spread">
                <h3 style={{ margin: 0 }} className="mono">{loan.refCode}</h3>
                {loanStatusBadge(loan.status)}
              </div>
              <div className="kv">
                <span className="k">Principal</span>
                <span className="v mono">{fmtUsd(loan.principalCents)}</span>
              </div>
              {loan.monthlyDueCents > 0 && (
                <div className="kv">
                  <span className="k">Monthly due</span>
                  <span className="v mono">
                    {fmtUsd(loan.monthlyDueCents)}
                    {loan.dueDay ? ` on the ${loan.dueDay}${ordinal(loan.dueDay)}` : ""}
                  </span>
                </div>
              )}
              {loan.startDate && (
                <div className="kv">
                  <span className="k">Started</span>
                  <span className="v">{new Date(loan.startDate).toLocaleDateString()}</span>
                </div>
              )}
              {loan.note && <p className="muted" style={{ marginBottom: 0 }}>{loan.note}</p>}
            </div>
          ))}
        </div>
      )}

      {/* ── Engagements ── */}
      <h2 style={{ marginTop: 32 }}>Engagements</h2>
      {!(data.engagements || []).length ? (
        <div className="empty">No active engagements.</div>
      ) : (
        <div className="stack">
          {data.engagements.map((eng, i) => (
            <div className="card" key={eng.id || i}>
              <div className="spread">
                <h3 style={{ margin: 0 }}>{eng.name}</h3>
                {engagementStatusBadge(eng.status)}
              </div>
              {eng.description && <p className="muted" style={{ marginBottom: 0 }}>{eng.description}</p>}
            </div>
          ))}
        </div>
      )}

      {/* ── Review prompts ── */}
      {(data.reviewable || []).length > 0 && (
        <>
          <h2 style={{ marginTop: 32 }}>Leave a review</h2>
          <div className="stack">
            {data.reviewable.map((b) => (
              <div className="card spread" key={b.id}>
                <div>
                  <strong>How was {b.serviceName}?</strong>
                  <br />
                  <span className="muted">
                    {b.startAt ? new Date(b.startAt).toLocaleDateString() : ""}
                  </span>
                </div>
                <button className="btn btn-gold btn-sm" onClick={() => setReviewBooking(b)}>
                  Write a review
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {cryptoInvoice && (
        <CryptoPaySheet
          invoice={cryptoInvoice}
          rails={rails}
          onClose={() => setCryptoInvoice(null)}
          onFiled={() => {
            setCryptoInvoice(null);
            load();
          }}
        />
      )}

      {reviewBooking && (
        <ReviewSheet
          booking={reviewBooking}
          onClose={() => setReviewBooking(null)}
          onDone={() => {
            setReviewBooking(null);
            setNotice("Review posted — thank you.");
            load();
          }}
        />
      )}
    </div>
  );
}

// 1 → "st", 2 → "nd", 15 → "th" … (due days are 1–28, so teens map cleanly)
function ordinal(n) {
  if (n >= 11 && n <= 13) return "th";
  return { 1: "st", 2: "nd", 3: "rd" }[n % 10] || "th";
}
