import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api.js";
import { fmtUsd, centsToUsd } from "../lib/money.js";
import usePageMeta from "../lib/usePageMeta.js";

// The member's reimbursement desk: snap receipts, let the scanner read them,
// confirm the numbers, bundle them into a request, pick how to be paid back.
// The human is the source of truth on every field — the scan only pre-fills.

const CHAINS = ["XRP", "SOL", "BTC", "TON"];
const METHOD_LABEL = {
  stripe: "Card / bank (Stripe)",
  crypto: "Crypto",
  telegram: "Telegram Wallet",
  cash: "Cash",
};
const STATUS_BADGE = {
  submitted: <span className="badge badge-gold">awaiting approval</span>,
  approved: <span className="badge badge-green">approved · payout pending</span>,
  paid: <span className="badge badge-green">paid</span>,
  rejected: <span className="badge badge-red">not approved</span>,
};

// Long edge capped at 1800px, JPEG — a phone photo of a receipt stays fully
// legible for the model at a fraction of the bytes.
const MAX_EDGE = 1800;
async function prepPhoto(file) {
  const isHeic = /heic|heif/i.test(file.type) || /\.hei[cf]$/i.test(file.name || "");
  let blob = file;
  if (isHeic) {
    const heic2any = (await import("heic2any")).default;
    const out = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.92 });
    blob = Array.isArray(out) ? out[0] : out;
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
    if (scale === 1 && !isHeic && file.size < 3 * 1024 * 1024) return file;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
    const jpeg = await new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.9));
    return new File([jpeg], (file.name || "receipt").replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function ScanStatus({ r, scanMode, onRescan }) {
  if (r.status === "queued")
    return (
      <span className="muted">
        ⏳ waiting for the scanner{scanMode === "ray" ? " (Ray)" : ""}
      </span>
    );
  if (r.status === "scanning") return <span className="muted">🔍 reading…</span>;
  if (r.status === "failed")
    return (
      <span className="red" title={r.scanError || ""}>
        ✕ scan failed —{" "}
        <button type="button" className="link-btn" onClick={() => onRescan(r, "ray")}>
          retry
        </button>
        {" · "}
        <button type="button" className="link-btn" onClick={() => onRescan(r, "cloud")}>
          try cloud
        </button>
      </span>
    );
  return (
    <span className="green" title={r.scanModel || ""}>
      ✓ read by {r.scanModel?.startsWith("ray:") ? "Ray" : "cloud AI"}
    </span>
  );
}

function ReceiptCard({ r, scanMode, selected, onToggle, onSaved, onDelete, onRescan, locked }) {
  const [f, setF] = useState({
    merchant: r.merchant || "",
    purchaseDate: r.purchaseDate || "",
    total: r.totalCents != null ? centsToUsd(r.totalCents) : "",
    note: r.note || "",
  });
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [showText, setShowText] = useState(false);

  // When a scan lands, adopt its values into untouched fields.
  useEffect(() => {
    if (dirty) return;
    setF({
      merchant: r.merchant || "",
      purchaseDate: r.purchaseDate || "",
      total: r.totalCents != null ? centsToUsd(r.totalCents) : "",
      note: r.note || "",
    });
  }, [r.merchant, r.purchaseDate, r.totalCents, r.note]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k) => (e) => {
    setDirty(true);
    setF((p) => ({ ...p, [k]: e.target.value }));
  };

  async function save() {
    setErr("");
    setBusy(true);
    try {
      const res = await api.updateReceipt({ id: r.id, ...f });
      setDirty(false);
      onSaved(res.receipt);
    } catch (e) {
      setErr(e.message);
    }
    setBusy(false);
  }

  const missingTotal = !f.total;
  return (
    <div className={`card receipt-card${selected ? " selected" : ""}`}>
      <a href={r.fileUrl} target="_blank" rel="noreferrer">
        <img className="receipt-thumb" src={r.fileUrl} alt="Receipt" loading="lazy" />
      </a>
      <div className="receipt-status">
        <ScanStatus r={r} scanMode={scanMode} onRescan={onRescan} />
        {!locked && (
          <label className="row" style={{ gap: 6, fontSize: "0.85rem" }}>
            <input type="checkbox" checked={selected} onChange={onToggle} /> include
          </label>
        )}
      </div>
      <div className="receipt-fields">
        <input className="full" placeholder="Merchant" value={f.merchant} onChange={set("merchant")} disabled={locked} />
        <input type="date" value={f.purchaseDate} onChange={set("purchaseDate")} disabled={locked} />
        <input
          inputMode="decimal"
          placeholder="Total 0.00"
          value={f.total}
          onChange={set("total")}
          disabled={locked}
          style={missingTotal && !locked ? { borderColor: "var(--gold)" } : undefined}
        />
        <input className="full" placeholder="What was it for? (optional)" value={f.note} onChange={set("note")} disabled={locked} />
      </div>
      {r.scan?.items?.length > 0 && (
        <details>
          <summary className="muted" style={{ cursor: "pointer", fontSize: "0.82rem" }}>
            {r.scan.items.length} line item{r.scan.items.length === 1 ? "" : "s"} read
          </summary>
          <ul className="muted" style={{ fontSize: "0.82rem", margin: "6px 0 0", paddingLeft: 18 }}>
            {r.scan.items.map((it, i) => (
              <li key={i}>
                {it.description}
                {it.amountCents != null ? ` — ${fmtUsd(it.amountCents)}` : ""}
              </li>
            ))}
          </ul>
        </details>
      )}
      {r.scan?.rawText && (
        <button type="button" className="link-btn muted" style={{ fontSize: "0.8rem" }} onClick={() => setShowText((v) => !v)}>
          {showText ? "hide" : "show"} transcribed text
        </button>
      )}
      {showText && <div className="scan-text">{r.scan.rawText}</div>}
      {err && <div className="form-result error">{err}</div>}
      {!locked && (
        <div className="row" style={{ justifyContent: "space-between" }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onDelete(r)} disabled={busy}>
            Remove
          </button>
          <button type="button" className={`btn btn-sm ${dirty ? "btn-gold" : "btn-ghost"}`} onClick={save} disabled={busy || !dirty}>
            {busy ? "Saving…" : dirty ? "Save" : "Saved"}
          </button>
        </div>
      )}
    </div>
  );
}

function PayoutProfile({ profile, onChange }) {
  const [method, setMethod] = useState(profile?.method || "cash");
  const [f, setF] = useState({
    cryptoChain: profile?.cryptoChain || "SOL",
    cryptoAddress: profile?.cryptoAddress || "",
    cryptoTag: profile?.cryptoTag || "",
    telegramHandle: profile?.telegramHandle || "",
    telegramTonAddress: profile?.telegramTonAddress || "",
    cashNote: profile?.cashNote || "",
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  useEffect(() => {
    if (profile?.method) setMethod(profile.method);
  }, [profile?.method]);

  async function save(e) {
    e?.preventDefault();
    setMsg(null);
    setBusy(true);
    try {
      const res = await api.savePayoutProfile({ method, ...f });
      onChange(res.profile);
      setMsg({ ok: true, text: "Saved." });
    } catch (e2) {
      setMsg({ ok: false, text: e2.message });
    }
    setBusy(false);
  }

  async function stripeStart() {
    setMsg(null);
    setBusy(true);
    try {
      const res = await api.stripePayoutOnboard();
      window.location.assign(res.url);
    } catch (e2) {
      setMsg({ ok: false, text: e2.message });
      setBusy(false);
    }
  }

  async function stripeRefresh() {
    setBusy(true);
    try {
      const res = await api.stripePayoutRefresh();
      onChange(res.profile);
      setMsg(res.profile.stripeOnboarded ? { ok: true, text: "Stripe payouts are ready." } : { ok: false, text: "Stripe still needs details — continue the setup." });
    } catch (e2) {
      setMsg({ ok: false, text: e2.message });
    }
    setBusy(false);
  }

  return (
    <form className="card" onSubmit={save}>
      <h3 style={{ marginBottom: 4 }}>How should we pay you back?</h3>
      <p className="muted" style={{ fontSize: "0.9rem" }}>
        Every request is approved by Sol before anything is sent. Cash is handed over in person after approval.
      </p>
      <div className="method-grid" style={{ marginBottom: 14 }}>
        {Object.entries(METHOD_LABEL).map(([k, label]) => (
          <button type="button" key={k} className={`method-pick${method === k ? " active" : ""}`} onClick={() => setMethod(k)}>
            {label}
            <small>
              {k === "stripe" && "Stripe sends it to your bank"}
              {k === "crypto" && "XRP · SOL · BTC · TON"}
              {k === "telegram" && "Wallet in Telegram (TON)"}
              {k === "cash" && "in person, after approval"}
            </small>
          </button>
        ))}
      </div>

      {method === "stripe" && (
        <div className="form-field">
          {profile?.stripeOnboarded ? (
            <div className="form-result success">Stripe payouts are set up. Money lands in the bank account you gave Stripe.</div>
          ) : (
            <>
              <p className="muted" style={{ fontSize: "0.9rem" }}>
                Stripe collects your bank details directly — Bank of Sol never sees them.
                {profile?.stripeConnected ? " You started this once; pick up where you left off." : ""}
              </p>
              <div className="row">
                <button type="button" className="btn btn-gold btn-sm" onClick={stripeStart} disabled={busy}>
                  {profile?.stripeConnected ? "Continue Stripe setup" : "Set up Stripe payouts"}
                </button>
                {profile?.stripeConnected && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={stripeRefresh} disabled={busy}>
                    I finished — check
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {method === "crypto" && (
        <>
          <div className="form-field">
            <label>Chain</label>
            <div className="row">
              {CHAINS.map((c) => (
                <button type="button" key={c} className={`btn btn-sm ${f.cryptoChain === c ? "btn-gold" : "btn-ghost"}`} onClick={() => setF((p) => ({ ...p, cryptoChain: c }))}>
                  {c}
                </button>
              ))}
            </div>
          </div>
          <div className="form-field">
            <label>Your {f.cryptoChain} receiving address <span className="req">*</span></label>
            <input value={f.cryptoAddress} onChange={set("cryptoAddress")} placeholder="Public address only" maxLength={130} />
            <span className="hint">Never paste a seed phrase or private key anywhere — we will never ask.</span>
          </div>
          {(f.cryptoChain === "XRP" || f.cryptoChain === "TON") && (
            <div className="form-field">
              <label>{f.cryptoChain === "XRP" ? "Destination tag" : "Memo"} (if your wallet needs one)</label>
              <input value={f.cryptoTag} onChange={set("cryptoTag")} maxLength={60} />
            </div>
          )}
        </>
      )}

      {method === "telegram" && (
        <>
          <div className="form-field">
            <label>Telegram username <span className="req">*</span></label>
            <input value={f.telegramHandle} onChange={set("telegramHandle")} placeholder="@username" maxLength={40} />
          </div>
          <div className="form-field">
            <label>Your TON address from Wallet (optional, speeds things up)</label>
            <input value={f.telegramTonAddress} onChange={set("telegramTonAddress")} placeholder="UQ… / EQ…" maxLength={130} />
            <span className="hint">In Telegram: Wallet → TON → Receive → copy the address.</span>
          </div>
        </>
      )}

      {method === "cash" && (
        <div className="form-field">
          <label>Where / when works (optional)</label>
          <input value={f.cashNote} onChange={set("cashNote")} placeholder="e.g. at the next POUND" maxLength={300} />
        </div>
      )}

      {msg && <div className={`form-result ${msg.ok ? "success" : "error"}`}>{msg.text}</div>}
      {method !== "stripe" && (
        <button className="btn btn-gold btn-sm" disabled={busy}>
          {busy ? "Saving…" : "Save payout method"}
        </button>
      )}
      {method === "stripe" && profile?.stripeConnected && profile?.method !== "stripe" && (
        <button className="btn btn-gold btn-sm" disabled={busy}>
          Use Stripe for payouts
        </button>
      )}
    </form>
  );
}

function payoutSummary(p) {
  if (!p) return "—";
  if (p.method === "stripe") return "Stripe → bank";
  if (p.method === "crypto") return `${p.chain} · ${p.address?.slice(0, 6)}…${p.address?.slice(-4)}`;
  if (p.method === "telegram") return `Telegram @${p.handle}`;
  return "Cash";
}

export default function Reimbursements() {
  usePageMeta({ title: "Reimbursements" });
  const [data, setData] = useState(null);
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState("");
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState(() => new Set());
  const [uploading, setUploading] = useState(0);
  const [over, setOver] = useState(false);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef(null);

  const load = () =>
    api
      .reimbursements()
      .then((d) => {
        setData(d);
        setPending(false);
      })
      .catch((e) => {
        if (e.status === 403) setPending(true);
        else setErr(e.message);
      });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const stripe = params.get("stripe");
    (async () => {
      if (stripe === "return") {
        try {
          const res = await api.stripePayoutRefresh();
          setNotice(res.profile.stripeOnboarded ? "Stripe payouts are ready." : "Stripe still needs a few details — continue the setup below.");
        } catch (e) {
          setErr(e.message);
        }
        window.history.replaceState({}, "", window.location.pathname);
      } else if (stripe === "refresh") {
        setNotice("The Stripe link expired — start the setup again below.");
        window.history.replaceState({}, "", window.location.pathname);
      }
      load();
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll while anything is still being read.
  const scanning = (data?.receipts || []).some((r) => r.status === "queued" || r.status === "scanning");
  useEffect(() => {
    if (!scanning) return;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [scanning]); // eslint-disable-line react-hooks/exhaustive-deps

  async function addFiles(list) {
    const files = [...(list || [])].filter((f) => f && f.size);
    if (!files.length) return;
    setErr("");
    setUploading((n) => n + files.length);
    for (const file of files) {
      try {
        const prepped = await prepPhoto(file);
        const res = await api.uploadReceipt(prepped);
        setData((d) => (d ? { ...d, receipts: [res.receipt, ...d.receipts] } : d));
      } catch (e) {
        setErr(e.message || "Upload failed");
      }
      setUploading((n) => n - 1);
    }
  }

  const patchReceipt = (rec) =>
    setData((d) => (d ? { ...d, receipts: d.receipts.map((x) => (x.id === rec.id ? rec : x)) } : d));

  async function removeReceipt(r) {
    if (!window.confirm("Remove this receipt?")) return;
    try {
      await api.deleteReceipt(r.id);
      setSelected((s) => {
        const n = new Set(s);
        n.delete(r.id);
        return n;
      });
      setData((d) => ({ ...d, receipts: d.receipts.filter((x) => x.id !== r.id) }));
    } catch (e) {
      setErr(e.message);
    }
  }

  async function rescan(r, where) {
    try {
      const res = await api.rescanReceipt(r.id, where);
      patchReceipt(res.receipt);
    } catch (e) {
      setErr(e.message);
    }
  }

  const toggle = (id) =>
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  async function submit(e) {
    e.preventDefault();
    setErr("");
    setSubmitting(true);
    try {
      const res = await api.submitReimbursement({ title, note, receiptIds: [...selected] });
      setNotice(`${res.refCode} sent to Sol for approval — ${fmtUsd(res.totalCents)}.`);
      setTitle("");
      setNote("");
      setSelected(new Set());
      await load();
    } catch (e2) {
      setErr(e2.message);
    }
    setSubmitting(false);
  }

  if (pending)
    return (
      <div className="page narrow">
        <div className="panel">
          <h1>Members only</h1>
          <p className="muted">Reimbursements open up once your membership is approved.</p>
          <Link className="btn btn-gold" to="/membership">Check your application</Link>
        </div>
      </div>
    );
  if (err && !data) return <div className="page"><div className="form-result error">{err}</div></div>;
  if (!data) return <div className="page"><div className="spinner">Loading…</div></div>;

  const loose = data.receipts || [];
  const selectedRows = loose.filter((r) => selected.has(r.id));
  const selectedTotal = selectedRows.reduce((s, r) => s + (r.totalCents || 0), 0);
  const selectedMissing = selectedRows.filter((r) => !r.totalCents).length;
  const profileReady = data.profile && (data.profile.method !== "stripe" || data.profile.stripeOnboarded);

  return (
    <div className="page">
      <div className="spread" style={{ marginBottom: 6 }}>
        <h1 style={{ margin: 0 }}>Receipts & reimbursements</h1>
        <Link className="btn btn-ghost btn-sm" to="/billing">Your ledger →</Link>
      </div>
      <p className="muted">
        Snap every receipt. The scanner reads the merchant, date, and total; you confirm them, bundle them into a request, and Sol approves and pays it out.
      </p>

      {notice && <div className="form-result success">{notice}</div>}
      {err && <div className="form-result error">{err}</div>}

      {/* ── 1. Upload ── */}
      <h2>1 · Add receipts</h2>
      <div
        className={`drop-zone${over ? " over" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          addFiles(e.dataTransfer.files);
        }}
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/*,.heic,.heif"
          multiple
          capture="environment"
          hidden
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <button type="button" className="btn btn-gold" onClick={() => fileRef.current?.click()} disabled={uploading > 0}>
          {uploading > 0 ? `Uploading ${uploading}…` : "📷 Take or choose photos"}
        </button>
        <p className="muted" style={{ margin: "10px 0 0", fontSize: "0.88rem" }}>
          or drop photos here · JPG, PNG, HEIC · several at once is fine
        </p>
      </div>

      {/* ── 2. Confirm ── */}
      <h2 style={{ marginTop: 28 }}>2 · Check what the scanner read</h2>
      {!loose.length ? (
        <div className="empty">No loose receipts. Add some above.</div>
      ) : (
        <div className="receipt-grid">
          {loose.map((r) => (
            <ReceiptCard
              key={r.id}
              r={r}
              scanMode={data.scanMode}
              selected={selected.has(r.id)}
              onToggle={() => toggle(r.id)}
              onSaved={patchReceipt}
              onDelete={removeReceipt}
              onRescan={rescan}
            />
          ))}
        </div>
      )}

      {/* ── 3. Payout method ── */}
      <h2 style={{ marginTop: 28 }}>3 · Payout method</h2>
      <PayoutProfile profile={data.profile} onChange={(p) => setData((d) => ({ ...d, profile: p }))} />

      {/* ── 4. Submit ── */}
      <h2 style={{ marginTop: 28 }}>4 · Send for approval</h2>
      <form className="card" onSubmit={submit}>
        <div className="kv">
          <span className="k">Receipts included</span>
          <span className="v">{selectedRows.length}</span>
        </div>
        <div className="kv">
          <span className="k">Total</span>
          <span className="v mono gold">{fmtUsd(selectedTotal)}</span>
        </div>
        {selectedMissing > 0 && (
          <div className="form-result error">
            {selectedMissing} selected receipt{selectedMissing === 1 ? " has" : "s have"} no total yet — fill it in and save.
          </div>
        )}
        {!profileReady && <div className="form-result error">Pick a payout method above first.</div>}
        <div className="form-field" style={{ marginTop: 10 }}>
          <label>What were the supplies for? <span className="req">*</span></label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. POUND October — decor + drinks" maxLength={140} required />
        </div>
        <div className="form-field">
          <label>Anything Sol should know (optional)</label>
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
        </div>
        <button className="btn btn-gold" disabled={submitting || !selectedRows.length || selectedMissing > 0 || !profileReady || !title.trim()}>
          {submitting ? "Sending…" : `Request ${fmtUsd(selectedTotal)} via ${METHOD_LABEL[data.profile?.method] || "—"}`}
        </button>
      </form>

      {/* ── History ── */}
      <h2 style={{ marginTop: 32 }}>Your requests</h2>
      {!(data.reimbursements || []).length ? (
        <div className="empty">Nothing filed yet.</div>
      ) : (
        <div className="stack">
          {data.reimbursements.map((x) => (
            <div className="card" key={x.id}>
              <div className="spread">
                <h3 style={{ margin: 0 }}>
                  {x.title} <span className="muted mono" style={{ fontSize: "0.8rem" }}>{x.refCode}</span>
                </h3>
                {STATUS_BADGE[x.status] || <span className="badge">{x.status}</span>}
              </div>
              <div className="kv">
                <span className="k">Total</span>
                <span className="v mono">{fmtUsd(x.totalCents)}</span>
              </div>
              <div className="kv">
                <span className="k">Payout</span>
                <span className="v">{payoutSummary(x.payout)}</span>
              </div>
              {x.status === "paid" && (
                <div className="kv">
                  <span className="k">Paid {x.paidAt ? new Date(x.paidAt).toLocaleDateString() : ""}</span>
                  <span className="v mono" style={{ fontSize: "0.8rem", wordBreak: "break-all" }}>
                    {x.paidMethod}{x.paidRef ? ` · ${x.paidRef}` : ""}
                  </span>
                </div>
              )}
              {x.adminNote && x.status !== "submitted" && (
                <p className="muted" style={{ margin: "6px 0 0", fontSize: "0.9rem" }}>Note from Sol: {x.adminNote}</p>
              )}
              <div className="row" style={{ marginTop: 8 }}>
                {x.receipts.map((r) => (
                  <a key={r.id} href={r.fileUrl} target="_blank" rel="noreferrer" title={`${r.merchant || "Receipt"} · ${r.totalCents != null ? fmtUsd(r.totalCents) : "?"}`}>
                    <img className="receipt-thumb-sm" src={r.fileUrl} alt="" loading="lazy" />
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
