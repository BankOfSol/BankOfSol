import { useState } from "react";
import { api } from "../lib/api.js";
import { fmtUsd } from "../lib/money.js";
import ColorSwatches from "./ColorSwatches.jsx";

// Buy flow, as a modal sheet: color (required when the product has colors),
// quantity, optional note, then off to Stripe Checkout — which is where the
// card and the shipping address are collected. No account needed: the order
// row is created server-side before the redirect and flips to paid on return.
export default function OrderSheet({ product, initialColor = null, onClose }) {
  const [color, setColor] = useState(initialColor);
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const colors = product?.colors || [];
  const needsColor = colors.length > 0 && !color;
  const each = fmtUsd(product.priceCents);
  const total = fmtUsd(product.priceCents * qty);

  async function payByCard() {
    setErr("");
    setBusy(true);
    try {
      const res = await api.shopCheckout({
        productId: product.id,
        colorName: color || undefined,
        qty,
        note: note || undefined,
      });
      window.location.assign(res.url); // off to Stripe
    } catch (e) {
      setErr(e.message || "Couldn't start checkout");
      setBusy(false);
    }
  }

  return (
    <div
      className="sheet-backdrop"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h3>{product.name}</h3>

        {colors.length > 0 && (
          <div className="form-field">
            <label>
              Color <span className="req">*</span>
            </label>
            <ColorSwatches
              colors={colors}
              value={color}
              onChange={setColor}
              showReset={false}
            />
          </div>
        )}

        <div className="form-field">
          <label>Quantity</label>
          <div className="qty-stepper">
            <button
              type="button"
              onClick={() => setQty(Math.max(1, qty - 1))}
              disabled={qty <= 1}
              aria-label="Fewer"
            >
              −
            </button>
            <span>{qty}</span>
            <button
              type="button"
              onClick={() => setQty(Math.min(20, qty + 1))}
              disabled={qty >= 20}
              aria-label="More"
            >
              +
            </button>
          </div>
        </div>

        <div className="form-field">
          <label>Note (optional)</label>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Sizing, color notes…"
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
          <button
            type="button"
            className="btn btn-gold"
            onClick={payByCard}
            disabled={busy || needsColor}
          >
            {busy
              ? "Opening checkout…"
              : needsColor
                ? "Pick a color"
                : `Pay ${total} by card`}
          </button>
        </div>

        <p className="hint">
          Secure card checkout by Stripe — your shipping address is collected
          there. {qty > 1 ? `${each} each. ` : ""}By ordering you agree to the{" "}
          <a href="/terms" target="_blank" rel="noopener">
            store policy
          </a>
          .
        </p>
      </div>
    </div>
  );
}
