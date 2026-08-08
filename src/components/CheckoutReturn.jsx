import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../lib/api.js";

// Stripe sends the buyer back to whichever page they bought from, with
// ?checkout=success&session_id=… — we re-check the session server-side rather
// than waiting on the webhook, so the order reads "paid" the moment they land.
// The params are stripped afterwards so a refresh doesn't re-confirm.
export default function CheckoutReturn({ onPaid }) {
  const [params, setParams] = useSearchParams();
  const status = params.get("checkout");
  const sessionId = params.get("session_id");
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (status !== "success" || !sessionId) return;
    api
      .shopConfirm(sessionId)
      .then((d) => {
        setResult(
          d.paid
            ? { ok: true, order: d.order }
            : {
                ok: false,
                msg: "Payment is still processing — check back in a minute.",
              }
        );
        if (d.paid) onPaid?.();
      })
      .catch((e) => setResult({ ok: false, msg: e.message }))
      .finally(() => {
        const p = new URLSearchParams(params);
        p.delete("checkout");
        p.delete("session_id");
        setParams(p, { replace: true });
      });
  }, [status, sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (status === "cancel") {
    return (
      <div className="form-result error">
        Payment cancelled — nothing was charged.
      </div>
    );
  }
  if (!result) return null;
  if (!result.ok) return <div className="form-result error">{result.msg}</div>;

  // Guests have no account to look the order up in later, so the ref code is
  // the only handle they get — say to keep it rather than burying it.
  return (
    <div className="form-result success">
      Paid — thank you!{" "}
      {result.order?.refCode
        ? `Hold on to your order ref — ${result.order.refCode} — it's how we find your order. `
        : ""}
      Stripe emailed your receipt.
    </div>
  );
}
