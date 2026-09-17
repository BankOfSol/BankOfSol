import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api.js";
import { fmtUsd } from "../lib/money.js";

// Admin member-account management: search → member list → full detail view
// (claims, invoices + builder, payments/adjustments, loans, engagements,
// ledger, reviews). Every mutation refetches the detail and pings onChanged
// so the admin page can refresh its counters.

const KIND_LABELS = {
  invoice: "Invoice",
  payment: "Payment",
  loan_disbursement: "Loan disbursed",
  loan_due: "Loan payment due",
  loan_payment: "Loan payment",
  adjustment: "Adjustment",
  refund: "Refund",
  reimbursement: "Reimbursement approved",
  payout: "Payout sent",
};

const METHODS = ["stripe", "XRP", "SOL", "BTC", "TON", "other"];

// What Ray found on-chain for a claim (functions/api/ray/claims.js). Advisory
// only: Sol still types the USD value and clicks Confirm.
function ChainCheck({ raw }) {
  if (!raw) return null;
  let c;
  try {
    c = JSON.parse(raw);
  } catch {
    return null;
  }
  const when = c.checkedAt ? new Date(c.checkedAt).toLocaleString() : "";
  if (!c.ok) {
    return (
      <div className="muted" style={{ fontSize: "0.78rem", marginTop: 4 }} title={when}>
        ⛓ not found on-chain yet{c.error ? ` · ${c.error}` : ""}
      </div>
    );
  }
  const good = c.matchesRail === true && c.confirmed !== false;
  return (
    <div className={good ? "green" : "red"} style={{ fontSize: "0.78rem", marginTop: 4 }} title={when}>
      ⛓ {c.amount} {c.symbol}
      {c.usd != null ? ` ≈ $${c.usd.toFixed(2)}` : ""}
      {c.matchesRail === true ? " → our address" : c.matchesRail === false ? " → NOT our address" : ""}
      {c.confirmed === false ? " · unconfirmed" : ""}
    </div>
  );
}

function BalanceChip({ cents, big = false }) {
  const style = big ? { fontSize: "1rem", padding: "6px 14px" } : undefined;
  if (cents > 0)
    return <span className="badge badge-red" style={style}>Owes {fmtUsd(cents)}</span>;
  if (cents < 0)
    return <span className="badge badge-green" style={style}>{fmtUsd(-cents)} credit</span>;
  return <span className="badge" style={style}>Settled</span>;
}

const statusBadge = (status, map) =>
  (map && map[status]) || <span className="badge">{status || "—"}</span>;

const INVOICE_BADGES = {
  draft: <span className="badge">draft</span>,
  open: <span className="badge badge-gold">open</span>,
  partial: <span className="badge badge-gold">partial</span>,
  paid: <span className="badge badge-green">paid</span>,
  void: <span className="badge">void</span>,
};

const LOAN_BADGES = {
  active: <span className="badge badge-gold">active</span>,
  paid: <span className="badge badge-green">paid</span>,
  defaulted: <span className="badge badge-red">defaulted</span>,
  forgiven: <span className="badge">forgiven</span>,
  closed: <span className="badge">closed</span>,
};

const ENGAGEMENT_BADGES = {
  onboarding: <span className="badge badge-gold">onboarding</span>,
  active: <span className="badge badge-green">active</span>,
  paused: <span className="badge">paused</span>,
  completed: <span className="badge badge-green">completed</span>,
  closed: <span className="badge">closed</span>,
};

const MEMBER_BADGES = {
  member: <span className="badge badge-green">member</span>,
  approved: <span className="badge badge-green">approved</span>,
  applied: <span className="badge badge-gold">applied</span>,
  pending: <span className="badge badge-gold">pending</span>,
  rejected: <span className="badge badge-red">rejected</span>,
  revoked: <span className="badge badge-red">revoked</span>,
};

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
                {e.kind === "loan_due" ? (
                  <span className="muted">—</span>
                ) : e.amountCents < 0 ? (
                  <span className="mono green">−{fmtUsd(-e.amountCents)}</span>
                ) : (
                  <span className="mono">{fmtUsd(e.amountCents)}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Invoice builder (new + editing drafts; unit prices are dollar strings) ──

const emptyItem = () => ({ description: "", qty: 1, unit: "" });
const emptyInvoiceForm = () => ({
  id: null,
  title: "",
  dueDate: "",
  notes: "",
  engagementId: "",
  items: [emptyItem()],
});

// UI preview only — the server recomputes totals from the posted dollar strings.
const itemCents = (it) => Math.round((Number(it.unit) || 0) * 100) * (Number(it.qty) || 0);

function InvoiceBuilder({ form, setForm, engagements, busy, onSave, onCancelEdit }) {
  const set = (patch) => setForm({ ...form, ...patch });
  const setItem = (i, patch) =>
    set({ items: form.items.map((it, j) => (j === i ? { ...it, ...patch } : it)) });
  const totalCents = form.items.reduce((s, it) => s + itemCents(it), 0);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
    >
      <h3>{form.id ? "Edit draft invoice" : "New invoice (saved as draft)"}</h3>
      <div className="form-field">
        <label>
          Title <span className="req">*</span>
        </label>
        <input
          value={form.title}
          onChange={(e) => set({ title: e.target.value })}
          placeholder="e.g. Custody onboarding — March"
          required
        />
      </div>
      <div className="row">
        <div className="form-field" style={{ flex: 1, minWidth: 160 }}>
          <label>Due date</label>
          <input type="date" value={form.dueDate} onChange={(e) => set({ dueDate: e.target.value })} />
        </div>
        {engagements?.length > 0 && (
          <div className="form-field" style={{ flex: 1, minWidth: 160 }}>
            <label>Engagement</label>
            <select
              value={form.engagementId}
              onChange={(e) => set({ engagementId: e.target.value })}
            >
              <option value="">— none —</option>
              {engagements.map((eng) => (
                <option key={eng.id} value={eng.id}>
                  {eng.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      <div className="form-field">
        <label>Notes (member-visible)</label>
        <input value={form.notes} onChange={(e) => set({ notes: e.target.value })} maxLength={1000} />
      </div>

      <label style={{ display: "block", fontWeight: 700, fontSize: "0.9rem", marginBottom: 6 }}>
        Line items <span className="req">*</span>
      </label>
      {form.items.map((it, i) => (
        <div className="row" key={i} style={{ marginBottom: 8, alignItems: "flex-start" }}>
          <input
            style={{ flex: 3, minWidth: 140 }}
            placeholder="Description"
            value={it.description}
            onChange={(e) => setItem(i, { description: e.target.value })}
            required
          />
          <input
            style={{ flex: 1, minWidth: 64, maxWidth: 90 }}
            type="number"
            min="1"
            step="1"
            placeholder="Qty"
            value={it.qty}
            onChange={(e) => setItem(i, { qty: e.target.value })}
            required
          />
          <input
            style={{ flex: 1, minWidth: 90, maxWidth: 130 }}
            inputMode="decimal"
            placeholder="Unit $ (150.00)"
            value={it.unit}
            onChange={(e) => setItem(i, { unit: e.target.value })}
            required
          />
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            aria-label="Remove line"
            disabled={form.items.length === 1}
            onClick={() => set({ items: form.items.filter((_, j) => j !== i) })}
          >
            ✕
          </button>
        </div>
      ))}
      <div className="spread" style={{ marginTop: 6 }}>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => set({ items: [...form.items, emptyItem()] })}
        >
          + Add line
        </button>
        <span className="mono" style={{ fontWeight: 800 }}>
          Total {fmtUsd(totalCents)}
        </span>
      </div>

      <div className="row" style={{ marginTop: 14 }}>
        <button className="btn btn-gold" disabled={busy}>
          {busy ? "Saving…" : form.id ? "Save draft" : "Create draft"}
        </button>
        {form.id && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={onCancelEdit} disabled={busy}>
            Cancel edit
          </button>
        )}
      </div>
      <span className="hint">Drafts are invisible to the member until you open them.</span>
    </form>
  );
}

// ── Payment / adjustment card ──

function PaymentCard({ userId, invoices, initialInvoiceId, act }) {
  const [pay, setPay] = useState({
    amount: "",
    method: "other",
    reference: "",
    invoiceId: initialInvoiceId || "",
    note: "",
  });
  const [adj, setAdj] = useState({ amount: "", note: "" });
  const [busy, setBusy] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    if (initialInvoiceId) {
      setPay((p) => ({ ...p, invoiceId: initialInvoiceId }));
      ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [initialInvoiceId]);

  const payable = (invoices || []).filter((i) => i.status === "open" || i.status === "partial");

  async function submitPayment(e) {
    e.preventDefault();
    setBusy("pay");
    const ok = await act(() =>
      api.adminRecordPayment({
        userId,
        amount: pay.amount,
        method: pay.method,
        reference: pay.reference || undefined,
        note: pay.note || undefined,
        invoiceId: pay.invoiceId || undefined,
      })
    );
    if (ok) setPay({ amount: "", method: "other", reference: "", invoiceId: "", note: "" });
    setBusy("");
  }

  async function submitAdjustment(e) {
    e.preventDefault();
    setBusy("adj");
    const ok = await act(() =>
      api.adminRecordPayment({ userId, kind: "adjustment", amount: adj.amount, note: adj.note })
    );
    if (ok) setAdj({ amount: "", note: "" });
    setBusy("");
  }

  return (
    <div className="card" ref={ref}>
      <h3>Record payment / adjustment</h3>

      <form onSubmit={submitPayment}>
        <div className="row" style={{ alignItems: "flex-end" }}>
          <div className="form-field" style={{ flex: 1, minWidth: 110, marginBottom: 10 }}>
            <label>
              Amount $ <span className="req">*</span>
            </label>
            <input
              inputMode="decimal"
              placeholder="150.00"
              value={pay.amount}
              onChange={(e) => setPay({ ...pay, amount: e.target.value })}
              required
            />
          </div>
          <div className="form-field" style={{ flex: 1, minWidth: 110, marginBottom: 10 }}>
            <label>Method</label>
            <select value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })}>
              {METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div className="form-field" style={{ flex: 2, minWidth: 140, marginBottom: 10 }}>
            <label>Reference</label>
            <input
              placeholder="Tx hash, check #…"
              value={pay.reference}
              onChange={(e) => setPay({ ...pay, reference: e.target.value })}
            />
          </div>
        </div>
        <div className="row" style={{ alignItems: "flex-end" }}>
          {payable.length > 0 && (
            <div className="form-field" style={{ flex: 1, minWidth: 160, marginBottom: 10 }}>
              <label>Apply to invoice</label>
              <select
                value={pay.invoiceId}
                onChange={(e) => setPay({ ...pay, invoiceId: e.target.value })}
              >
                <option value="">— none (account credit) —</option>
                {payable.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.refCode} · {i.title} ({fmtUsd(i.totalCents - (i.paidCents || 0))} left)
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="form-field" style={{ flex: 2, minWidth: 160, marginBottom: 10 }}>
            <label>Note</label>
            <input value={pay.note} onChange={(e) => setPay({ ...pay, note: e.target.value })} />
          </div>
          <div className="form-field" style={{ marginBottom: 10 }}>
            <button className="btn btn-green" disabled={busy === "pay"}>
              {busy === "pay" ? "Recording…" : "Record payment"}
            </button>
          </div>
        </div>
      </form>

      <hr className="divider" />

      <form onSubmit={submitAdjustment}>
        <div className="row" style={{ alignItems: "flex-end" }}>
          <div className="form-field" style={{ flex: 1, minWidth: 120, marginBottom: 10 }}>
            <label>
              Adjustment $ <span className="req">*</span>
            </label>
            <input
              inputMode="decimal"
              placeholder="-25.00"
              value={adj.amount}
              onChange={(e) => setAdj({ ...adj, amount: e.target.value })}
              required
            />
            <span className="hint">Signed: positive = they owe more, negative = credit.</span>
          </div>
          <div className="form-field" style={{ flex: 2, minWidth: 160, marginBottom: 10 }}>
            <label>
              Reason <span className="req">*</span>
            </label>
            <input
              value={adj.note}
              onChange={(e) => setAdj({ ...adj, note: e.target.value })}
              required
            />
          </div>
          <div className="form-field" style={{ marginBottom: 10 }}>
            <button className="btn btn-ghost" disabled={busy === "adj"}>
              {busy === "adj" ? "Recording…" : "Record adjustment"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

// ── Loans card ──

function LoansCard({ userId, loans, act }) {
  const [form, setForm] = useState({
    principal: "",
    monthlyDue: "",
    dueDay: "",
    startDate: "",
    note: "",
  });
  const [busy, setBusy] = useState(false);

  async function recordPayment(loan) {
    const amount = window.prompt(`Loan payment received on ${loan.refCode} — USD amount, e.g. "100.00"`);
    if (!amount) return;
    await act(() => api.adminLoan({ action: "payment", id: loan.id, amount: amount.trim() }));
  }

  async function setStatus(loan, status) {
    if (!status || status === loan.status) return;
    if (
      status === "forgiven" &&
      !window.confirm("Forgive this loan? This books off the outstanding remainder.")
    )
      return;
    await act(() => api.adminLoan({ action: "status", id: loan.id, status }));
  }

  async function createLoan(e) {
    e.preventDefault();
    setBusy(true);
    const ok = await act(() =>
      api.adminLoan({
        action: "create",
        userId,
        principal: form.principal,
        monthlyDue: form.monthlyDue || undefined,
        dueDay: form.dueDay ? Number(form.dueDay) : undefined,
        startDate: form.startDate || undefined,
        note: form.note || undefined,
      })
    );
    if (ok) setForm({ principal: "", monthlyDue: "", dueDay: "", startDate: "", note: "" });
    setBusy(false);
  }

  return (
    <div className="card">
      <h3>Loans</h3>
      {!loans?.length ? (
        <div className="empty">No loans.</div>
      ) : (
        <div className="stack">
          {loans.map((loan) => (
            <div className="card-raised card" key={loan.id || loan.refCode}>
              <div className="spread">
                <strong className="mono">{loan.refCode}</strong>
                {statusBadge(loan.status, LOAN_BADGES)}
              </div>
              <div className="kv">
                <span className="k">Principal</span>
                <span className="v mono">{fmtUsd(loan.principalCents)}</span>
              </div>
              <div className="kv">
                <span className="k">Monthly / due day</span>
                <span className="v mono">
                  {loan.monthlyDueCents ? fmtUsd(loan.monthlyDueCents) : "—"}
                  {loan.dueDay ? ` · day ${loan.dueDay}` : ""}
                </span>
              </div>
              {loan.startDate && (
                <div className="kv">
                  <span className="k">Started</span>
                  <span className="v">{new Date(loan.startDate).toLocaleDateString()}</span>
                </div>
              )}
              {loan.note && <p className="muted">{loan.note}</p>}
              <div className="row">
                <button className="btn btn-green btn-sm" onClick={() => recordPayment(loan)}>
                  Record payment
                </button>
                <select
                  style={{ width: "auto" }}
                  value={loan.status}
                  onChange={(e) => setStatus(loan, e.target.value)}
                >
                  {["active", "paid", "closed", "defaulted", "forgiven"].map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ))}
        </div>
      )}

      <hr className="divider" />
      <form onSubmit={createLoan}>
        <h3 style={{ fontSize: "1.02rem" }}>New loan</h3>
        <div className="row" style={{ alignItems: "flex-end" }}>
          <div className="form-field" style={{ flex: 1, minWidth: 110, marginBottom: 10 }}>
            <label>
              Principal $ <span className="req">*</span>
            </label>
            <input
              inputMode="decimal"
              placeholder="500.00"
              value={form.principal}
              onChange={(e) => setForm({ ...form, principal: e.target.value })}
              required
            />
          </div>
          <div className="form-field" style={{ flex: 1, minWidth: 110, marginBottom: 10 }}>
            <label>Monthly due $</label>
            <input
              inputMode="decimal"
              placeholder="100.00"
              value={form.monthlyDue}
              onChange={(e) => setForm({ ...form, monthlyDue: e.target.value })}
            />
          </div>
          <div className="form-field" style={{ flex: 1, minWidth: 90, maxWidth: 120, marginBottom: 10 }}>
            <label>Due day</label>
            <input
              type="number"
              min="1"
              max="28"
              placeholder="1–28"
              value={form.dueDay}
              onChange={(e) => setForm({ ...form, dueDay: e.target.value })}
            />
          </div>
          <div className="form-field" style={{ flex: 1, minWidth: 150, marginBottom: 10 }}>
            <label>Start date</label>
            <input
              type="date"
              value={form.startDate}
              onChange={(e) => setForm({ ...form, startDate: e.target.value })}
            />
          </div>
        </div>
        <div className="row" style={{ alignItems: "flex-end" }}>
          <div className="form-field" style={{ flex: 1, minWidth: 180, marginBottom: 10 }}>
            <label>Note</label>
            <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </div>
          <div className="form-field" style={{ marginBottom: 10 }}>
            <button className="btn btn-gold" disabled={busy}>
              {busy ? "Creating…" : "Disburse loan"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

// ── Engagements card ──

const ENGAGEMENT_STATUSES = ["onboarding", "active", "paused", "completed", "closed"];

function EngagementsCard({ userId, engagements, act }) {
  const [editing, setEditing] = useState(null); // engagement being edited
  const [form, setForm] = useState({ name: "", description: "", adminNote: "", status: "onboarding" });
  const [busy, setBusy] = useState(false);

  function startEdit(eng) {
    setEditing(eng);
    setForm({
      name: eng.name || "",
      description: eng.description || "",
      adminNote: eng.adminNote || "",
      status: eng.status || "onboarding",
    });
  }

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    const ok = await act(() =>
      api.adminSaveEngagement({
        userId,
        ...(editing ? { id: editing.id } : {}),
        name: form.name,
        description: form.description || undefined,
        status: form.status,
        adminNote: form.adminNote || undefined,
      })
    );
    if (ok) {
      setEditing(null);
      setForm({ name: "", description: "", adminNote: "", status: "onboarding" });
    }
    setBusy(false);
  }

  return (
    <div className="card">
      <h3>Engagements</h3>
      {!engagements?.length ? (
        <div className="empty">No engagements.</div>
      ) : (
        <div className="stack">
          {engagements.map((eng) => (
            <div className="card-raised card" key={eng.id}>
              <div className="spread">
                <strong>{eng.name}</strong>
                <div className="row" style={{ gap: 8 }}>
                  {statusBadge(eng.status, ENGAGEMENT_BADGES)}
                  <select
                    style={{ width: "auto" }}
                    value={eng.status}
                    onChange={(e) =>
                      act(() =>
                        api.adminSaveEngagement({
                          userId,
                          id: eng.id,
                          name: eng.name,
                          description: eng.description || undefined,
                          adminNote: eng.adminNote || undefined,
                          status: e.target.value,
                        })
                      )
                    }
                  >
                    {ENGAGEMENT_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  <button className="btn btn-ghost btn-sm" onClick={() => startEdit(eng)}>
                    Edit
                  </button>
                </div>
              </div>
              {eng.description && <p className="muted">{eng.description}</p>}
              {eng.adminNote && (
                <p className="muted" style={{ fontSize: "0.84rem" }}>
                  🔒 {eng.adminNote}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      <hr className="divider" />
      <form onSubmit={save}>
        <h3 style={{ fontSize: "1.02rem" }}>{editing ? `Edit "${editing.name}"` : "New engagement"}</h3>
        <div className="row" style={{ alignItems: "flex-end" }}>
          <div className="form-field" style={{ flex: 2, minWidth: 160, marginBottom: 10 }}>
            <label>
              Name <span className="req">*</span>
            </label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>
          <div className="form-field" style={{ flex: 1, minWidth: 130, marginBottom: 10 }}>
            <label>Status</label>
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              {ENGAGEMENT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="form-field">
          <label>Description (member-visible)</label>
          <input
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </div>
        <div className="form-field">
          <label>Admin note (private)</label>
          <input
            value={form.adminNote}
            onChange={(e) => setForm({ ...form, adminNote: e.target.value })}
          />
        </div>
        <div className="row">
          <button className="btn btn-gold" disabled={busy}>
            {busy ? "Saving…" : editing ? "Save engagement" : "Create engagement"}
          </button>
          {editing && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={busy}
              onClick={() => {
                setEditing(null);
                setForm({ name: "", description: "", adminNote: "", status: "onboarding" });
              }}
            >
              Cancel edit
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

// ── Member detail ──

function MemberDetail({ userId, onBack, onChanged }) {
  const [detail, setDetail] = useState(null);
  const [err, setErr] = useState("");
  const [invoiceForm, setInvoiceForm] = useState(emptyInvoiceForm());
  const [invoiceBusy, setInvoiceBusy] = useState(false);
  const [payPrefill, setPayPrefill] = useState("");

  const load = () =>
    api
      .adminMember(userId)
      .then(setDetail)
      .catch((e) => setErr(e.message));

  useEffect(() => {
    load();
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Wraps every mutation: run it, refetch, ping the parent. Returns success.
  async function act(fn) {
    setErr("");
    try {
      await fn();
      await load();
      onChanged?.();
      return true;
    } catch (e) {
      setErr(e.message);
      return false;
    }
  }

  async function saveInvoice() {
    setInvoiceBusy(true);
    const ok = await act(() =>
      api.adminSaveInvoice({
        userId,
        ...(invoiceForm.id ? { id: invoiceForm.id } : {}),
        title: invoiceForm.title,
        items: invoiceForm.items.map((it) => ({
          description: it.description,
          qty: Number(it.qty) || 1,
          unit: String(it.unit).trim(),
        })),
        dueDate: invoiceForm.dueDate || undefined,
        notes: invoiceForm.notes || undefined,
        engagementId: invoiceForm.engagementId || undefined,
      })
    );
    if (ok) setInvoiceForm(emptyInvoiceForm());
    setInvoiceBusy(false);
  }

  function editDraft(inv) {
    setInvoiceForm({
      id: inv.id,
      title: inv.title || "",
      dueDate: inv.dueDate ? String(inv.dueDate).slice(0, 10) : "",
      notes: inv.notes || "",
      engagementId: inv.engagementId || "",
      items: (inv.items || []).length
        ? inv.items.map((it) => ({
            description: it.description,
            qty: it.qty,
            unit: (it.unitCents / 100).toFixed(2),
          }))
        : [emptyItem()],
    });
  }

  async function confirmClaim(claim) {
    const amount = window.prompt(
      `USD value received for claim on ${claim.invoiceRef || "invoice"} (e.g. "150.00")`
    );
    if (!amount) return;
    await act(() => api.adminClaimAction(claim.id, "confirm", amount.trim()));
  }

  if (err && !detail) {
    return (
      <div>
        <button className="btn btn-ghost btn-sm" onClick={onBack}>
          ← All members
        </button>
        <div className="form-result error" style={{ marginTop: 12 }}>{err}</div>
      </div>
    );
  }
  if (!detail) return <div className="spinner">Loading member…</div>;

  const { account } = detail;
  const pendingClaims = (detail.claims || []).filter((c) => c.status === "pending");

  return (
    <div>
      <button className="btn btn-ghost btn-sm" onClick={onBack}>
        ← All members
      </button>

      <div className="spread" style={{ margin: "14px 0 18px" }}>
        <div>
          <h2 style={{ margin: 0 }}>{account.name || account.email}</h2>
          <span className="muted">{account.email}</span>
          <br />
          <span className="muted" style={{ fontSize: "0.84rem" }}>
            {statusBadge(account.status, MEMBER_BADGES)}{" "}
            {account.userSince && <>· member since {new Date(account.userSince).toLocaleDateString()}</>}
          </span>
        </div>
        <div className="vault-stat">
          <div className="stat-label">Balance</div>
          <div className="stat-value">
            {detail.balance > 0 ? (
              <span className="red">Owes {fmtUsd(detail.balance)}</span>
            ) : detail.balance < 0 ? (
              <span className="green">{fmtUsd(-detail.balance)} credit</span>
            ) : (
              "Settled"
            )}
          </div>
        </div>
      </div>

      {account.adminNote && (
        <p className="muted" style={{ marginTop: -8 }}>
          🔒 {account.adminNote}
        </p>
      )}

      {err && <div className="form-result error">{err}</div>}

      <div className="stack">
        {/* a. Pending claims */}
        {pendingClaims.length > 0 && (
          <div className="card">
            <h3>
              Pending crypto claims <span className="tab-badge">{pendingClaims.length}</span>
            </h3>
            <div className="table-wrap">
              <table className="list">
                <thead>
                  <tr>
                    <th>Chain</th>
                    <th>Invoice</th>
                    <th>Tx</th>
                    <th>Filed</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {pendingClaims.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <span className="badge badge-gold">{c.chain}</span>
                      </td>
                      <td>
                        <span className="mono">{c.invoiceRef}</span>
                        <br />
                        <span className="muted" style={{ fontSize: "0.82rem" }}>
                          {c.invoiceTitle} · {fmtUsd((c.totalCents || 0) - (c.paidCents || 0))} left
                        </span>
                      </td>
                      <td>
                        <span
                          className="mono muted"
                          title={c.txRef}
                          style={{
                            display: "inline-block",
                            maxWidth: 130,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            fontSize: "0.8rem",
                          }}
                        >
                          {c.txRef}
                        </span>
                        {c.note && (
                          <>
                            <br />
                            <span className="muted" style={{ fontSize: "0.8rem" }}>{c.note}</span>
                          </>
                        )}
                        <ChainCheck raw={c.chainCheckJson} />
                      </td>
                      <td className="muted" style={{ whiteSpace: "nowrap" }}>
                        {c.createdAt ? new Date(c.createdAt).toLocaleDateString() : "—"}
                      </td>
                      <td>
                        <div className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
                          <button className="btn btn-green btn-sm" onClick={() => confirmClaim(c)}>
                            Confirm
                          </button>
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() =>
                              window.confirm("Reject this claim?") &&
                              act(() => api.adminClaimAction(c.id, "reject"))
                            }
                          >
                            Reject
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* b. Invoices + builder */}
        <div className="card">
          <h3>Invoices</h3>
          {!(detail.invoices || []).length ? (
            <div className="empty">No invoices yet.</div>
          ) : (
            <div className="stack">
              {detail.invoices.map((inv) => (
                <div className="card-raised card" key={inv.id}>
                  <div className="spread">
                    <div>
                      <strong>{inv.title}</strong>{" "}
                      <span className="mono muted" style={{ fontSize: "0.8rem" }}>{inv.refCode}</span>
                    </div>
                    {statusBadge(inv.status, INVOICE_BADGES)}
                  </div>
                  <div className="muted" style={{ fontSize: "0.86rem", margin: "4px 0" }}>
                    {(inv.items || [])
                      .map((it) => `${it.qty}× ${it.description} @ ${fmtUsd(it.unitCents)}`)
                      .join(" · ") || "No items"}
                  </div>
                  <div className="kv">
                    <span className="k">
                      Total{inv.paidCents > 0 ? ` (paid ${fmtUsd(inv.paidCents)})` : ""}
                      {inv.dueDate ? ` · due ${new Date(inv.dueDate).toLocaleDateString()}` : ""}
                    </span>
                    <span className="v mono">{fmtUsd(inv.totalCents)}</span>
                  </div>
                  <div className="row">
                    {inv.status === "draft" && (
                      <>
                        <button className="btn btn-ghost btn-sm" onClick={() => editDraft(inv)}>
                          Edit
                        </button>
                        <button
                          className="btn btn-gold btn-sm"
                          onClick={() =>
                            window.confirm("Open this invoice? The member will see it and can pay.") &&
                            act(() => api.adminInvoiceAction(inv.id, "open"))
                          }
                        >
                          Open
                        </button>
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() =>
                            window.confirm("Delete (void) this draft?") &&
                            act(() => api.adminInvoiceAction(inv.id, "void"))
                          }
                        >
                          Delete
                        </button>
                      </>
                    )}
                    {(inv.status === "open" || inv.status === "partial") && (
                      <>
                        <button
                          className="btn btn-green btn-sm"
                          onClick={() => setPayPrefill(inv.id)}
                        >
                          Record payment
                        </button>
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() =>
                            window.confirm("Void this invoice? Any unpaid remainder is written off.") &&
                            act(() => api.adminInvoiceAction(inv.id, "void"))
                          }
                        >
                          Void
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <hr className="divider" />
          <InvoiceBuilder
            form={invoiceForm}
            setForm={setInvoiceForm}
            engagements={detail.engagements}
            busy={invoiceBusy}
            onSave={saveInvoice}
            onCancelEdit={() => setInvoiceForm(emptyInvoiceForm())}
          />
        </div>

        {/* c. Payment / adjustment */}
        <PaymentCard
          userId={userId}
          invoices={detail.invoices}
          initialInvoiceId={payPrefill}
          act={act}
        />

        {/* d. Loans */}
        <LoansCard userId={userId} loans={detail.loans} act={act} />

        {/* e. Engagements */}
        <EngagementsCard userId={userId} engagements={detail.engagements} act={act} />

        {/* f. Ledger */}
        <div className="card">
          <h3>Itemized ledger</h3>
          <LedgerTable entries={detail.entries} />
        </div>

        {/* g. Reviews + bookings (read-only context) */}
        <div className="card">
          <h3>Reviews & bookings</h3>
          {!(detail.reviews || []).length ? (
            <div className="empty">No reviews yet.</div>
          ) : (
            <div className="stack" style={{ marginBottom: 14 }}>
              {detail.reviews.map((r, i) => (
                <div className="card-raised card" key={r.id || i}>
                  <div className="spread">
                    <strong>{r.serviceName}</strong>
                    <span className="gold" aria-label={`${r.rating} of 5 stars`}>
                      {"★".repeat(r.rating || 0)}
                      <span className="muted">{"☆".repeat(Math.max(0, 5 - (r.rating || 0)))}</span>
                    </span>
                  </div>
                  {r.body && <p className="muted" style={{ marginBottom: 0 }}>{r.body}</p>}
                </div>
              ))}
            </div>
          )}
          {(detail.bookings || []).length > 0 && (
            <div className="table-wrap">
              <table className="list">
                <thead>
                  <tr>
                    <th>Booking</th>
                    <th>When</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.bookings.map((b, i) => (
                    <tr key={b.id || i}>
                      <td>{b.serviceName || b.service || "—"}</td>
                      <td className="muted" style={{ whiteSpace: "nowrap" }}>
                        {b.startAt ? new Date(b.startAt).toLocaleString() : "—"}
                      </td>
                      <td>
                        <span className="badge">{b.status || "—"}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── List + shell ──

export default function AdminMembers({ onChanged }) {
  const [members, setMembers] = useState(null);
  const [search, setSearch] = useState("");
  const [err, setErr] = useState("");
  const [selected, setSelected] = useState(null); // userId

  const load = (q = "") =>
    api
      .adminMembers(q)
      .then((d) => setMembers(d.members || []))
      .catch((e) => setErr(e.message));

  useEffect(() => {
    load();
  }, []);

  if (selected) {
    return (
      <MemberDetail
        userId={selected}
        onBack={() => {
          setSelected(null);
          load(search);
        }}
        onChanged={onChanged}
      />
    );
  }

  return (
    <div>
      <form
        className="row"
        style={{ marginBottom: 14 }}
        onSubmit={(e) => {
          e.preventDefault();
          load(search);
        }}
      >
        <input
          style={{ flex: 1, minWidth: 200 }}
          placeholder="Search members by name or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button className="btn btn-ghost btn-sm">Search</button>
      </form>

      {err && <div className="form-result error">{err}</div>}

      {!members ? (
        <div className="spinner">Loading members…</div>
      ) : !members.length ? (
        <div className="empty">No members match.</div>
      ) : (
        <div className="stack">
          {members.map((m) => (
            <button
              key={m.userId}
              className="card spread"
              style={{ textAlign: "left", cursor: "pointer", font: "inherit", color: "inherit", width: "100%" }}
              onClick={() => setSelected(m.userId)}
            >
              <div>
                <strong>{m.name || "—"}</strong>
                <br />
                <span className="muted">{m.email}</span>
              </div>
              <div className="row" style={{ gap: 6, justifyContent: "flex-end" }}>
                {statusBadge(m.memberStatus, MEMBER_BADGES)}
                <BalanceChip cents={m.balanceCents || 0} />
                {m.openInvoices > 0 && <span className="badge">{m.openInvoices} open inv</span>}
                {m.pendingClaims > 0 && (
                  <span className="badge badge-gold">{m.pendingClaims} claim{m.pendingClaims > 1 ? "s" : ""}</span>
                )}
                {m.activeLoans > 0 && <span className="badge">{m.activeLoans} loan{m.activeLoans > 1 ? "s" : ""}</span>}
                {m.activeEngagements > 0 && (
                  <span className="badge">{m.activeEngagements} engagement{m.activeEngagements > 1 ? "s" : ""}</span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
