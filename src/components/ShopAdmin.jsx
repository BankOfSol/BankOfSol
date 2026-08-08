import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api.js";
import { ASPECTS } from "../lib/imageBoxes.js";
import { fmtUsd, centsToUsd } from "../lib/money.js";
import ImageCropUploader from "./ImageCropUploader.jsx";
import MultiImageUploader from "./MultiImageUploader.jsx";

// The shop's back office, rendered *inside* /shop under the admin view toggle
// rather than as an /admin tab. Three subtabs:
//   products — catalog CRUD (photos, colors, price, lifecycle, 3D model file)
//   orders   — pending → paid → fulfilled, with the Stripe shipping address
//   shop     — the shop profile; the first save creates the shop row
//
// Everything here is also enforced server-side by requireAdmin — the toggle
// only decides what gets drawn.

const EMPTY_PRODUCT = {
  name: "",
  description: "",
  price: "",
  images: [],
  modelUrl: null,
  colors: [],
  status: "draft",
  sortOrder: 0,
};

const PRODUCT_STATUSES = ["draft", "published", "soldout", "archived", "hidden"];

const ORDER_TABS = ["pending", "paid", "fulfilled", "cancelled", "refunded", "all"];

// Target statuses offered per current status (mirrors ORDER_TRANSITIONS in
// functions/lib/shop.js, restricted to the actions the endpoint accepts).
// 'fulfilling' rows can appear once the Phase-2 print farm lands, so they get
// exits too. Terminal states offer nothing.
const ORDER_ACTIONS = {
  pending: [
    ["paid", "Mark paid", "btn-green"],
    ["cancelled", "Cancel", "btn-danger"],
  ],
  paid: [
    ["fulfilled", "Mark fulfilled", "btn-green"],
    ["refunded", "Mark refunded", "btn-ghost"],
    ["cancelled", "Cancel", "btn-danger"],
  ],
  fulfilling: [
    ["fulfilled", "Mark fulfilled", "btn-green"],
    ["refunded", "Mark refunded", "btn-ghost"],
    ["cancelled", "Cancel", "btn-danger"],
  ],
};

// Shared status → badge color, for product and order lifecycles alike.
// (Also used by the "My orders" list on the storefront.)
export const badgeClass = (status) =>
  ({
    published: "badge badge-green",
    paid: "badge badge-green",
    fulfilled: "badge badge-green",
    pending: "badge badge-gold",
    fulfilling: "badge badge-gold",
    soldout: "badge badge-gold",
    cancelled: "badge badge-red",
    refunded: "badge badge-red",
    expired: "badge badge-red",
  })[status] || "badge";

// Mirrors isUsdPrice in functions/lib/shop.js — '24' or '24.50', > 0.
const isUsdPrice = (s) =>
  typeof s === "string" && /^\d{1,6}(\.\d{1,2})?$/.test(s) && /[1-9]/.test(s);

// A product row from the API → the shape the form edits (cents → '24.50').
// The server prefers the `price` string when both are present, so the edited
// value always wins over the stale priceCents riding along.
const toForm = (p) => ({ ...p, price: centsToUsd(p.priceCents) });

// Picker for the product's 3D model file (.3mf/.glb — validated server-side
// too). It only stores a URL; there's no viewer here, the file feeds the
// Phase-2 print pipeline.
function ModelField({ url, onChange, onBusyChange }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function pick(e) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    if (!/\.(3mf|glb)$/i.test(file.name)) {
      setErr("Use a .3mf or .glb file");
      return;
    }
    setErr("");
    setBusy(true);
    onBusyChange?.(true);
    try {
      const { url: uploaded } = await api.upload(file);
      onChange(uploaded);
    } catch (e2) {
      setErr(e2.message || "Upload failed");
    } finally {
      setBusy(false);
      onBusyChange?.(false);
    }
  }

  return (
    <div>
      {url && (
        <div className="row">
          <span className="hint mono">{url.split("/").pop()}</span>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => onChange(null)}
            disabled={busy}
          >
            Remove
          </button>
        </div>
      )}
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
      >
        {busy ? "Uploading…" : url ? "Replace model" : "Choose model file"}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".3mf,.glb"
        onChange={pick}
        style={{ display: "none" }}
      />
      {err && <div className="form-result error">{err}</div>}
    </div>
  );
}

function ProductForm({ initial, onSaved, onClose }) {
  const [p, setP] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState("");
  const set = (k, v) => setP((prev) => ({ ...prev, [k]: v }));

  async function save() {
    setErr("");
    if (!isUsdPrice(p.price)) {
      setErr("Price must be a dollar amount like 24.00");
      return;
    }
    setBusy(true);
    try {
      await api.adminSaveProduct(p);
      onSaved();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel">
      <h3>{p.id ? "Edit product" : "New product"}</h3>

      <div className="form-field">
        <label>
          Name <span className="req">*</span>
        </label>
        <input
          value={p.name}
          onChange={(e) => set("name", e.target.value)}
          maxLength={120}
        />
      </div>

      <div className="form-field">
        <label>
          Price in USD <span className="req">*</span>
        </label>
        <input
          value={p.price}
          onChange={(e) => set("price", e.target.value.trim())}
          placeholder="24.00"
          inputMode="decimal"
        />
        <div className="hint">What the buyer is charged at card checkout.</div>
      </div>

      <div className="form-field">
        <label>Description</label>
        <textarea
          value={p.description || ""}
          onChange={(e) => set("description", e.target.value)}
          maxLength={2000}
        />
      </div>

      <div className="form-field">
        <label>Status</label>
        <select value={p.status} onChange={(e) => set("status", e.target.value)}>
          {PRODUCT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <div className="hint">
          Only published and soldout products appear in the store.
        </div>
      </div>

      <div className="form-field">
        <label>Sort order</label>
        <input
          type="number"
          value={p.sortOrder ?? 0}
          onChange={(e) => set("sortOrder", e.target.value)}
          inputMode="numeric"
        />
        <div className="hint">Lower numbers show first on the storefront.</div>
      </div>

      <div className="form-field">
        <label>Available colors</label>
        {p.colors.map((c, i) => (
          <div className="color-row" key={i}>
            <input
              type="color"
              value={c.hex}
              onChange={(e) =>
                set(
                  "colors",
                  p.colors.map((x, j) => (j === i ? { ...x, hex: e.target.value } : x))
                )
              }
              aria-label="Color value"
            />
            <input
              value={c.name}
              placeholder="Color name (e.g. Sun Gold)"
              maxLength={40}
              onChange={(e) =>
                set(
                  "colors",
                  p.colors.map((x, j) => (j === i ? { ...x, name: e.target.value } : x))
                )
              }
            />
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => set("colors", p.colors.filter((_, j) => j !== i))}
              aria-label="Remove color"
            >
              ✕
            </button>
          </div>
        ))}
        {p.colors.length < 12 && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => set("colors", [...p.colors, { name: "", hex: "#f0b90b" }])}
          >
            + Add color
          </button>
        )}
      </div>

      <div className="form-field">
        <label>Photos (first one is the card image)</label>
        <MultiImageUploader
          urls={p.images}
          onChange={(images) => set("images", images)}
          onBusyChange={setUploading}
        />
      </div>

      <div className="form-field">
        <label>3D model file (.3mf or .glb)</label>
        <ModelField
          url={p.modelUrl}
          onChange={(modelUrl) => set("modelUrl", modelUrl)}
          onBusyChange={setUploading}
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
          className="btn btn-green btn-sm"
          onClick={save}
          disabled={busy || uploading}
        >
          {busy ? "Saving…" : p.id ? "Save changes" : "Create product"}
        </button>
      </div>
    </div>
  );
}

function ProductsTab({ data, reload }) {
  const [editing, setEditing] = useState(null); // EMPTY_PRODUCT | product form
  const [busyId, setBusyId] = useState("");

  async function setStatus(p, status) {
    setBusyId(p.id);
    try {
      // Whole row + new status: priceCents passes through unchanged, so a
      // quick status flip can't mangle the price.
      await api.adminSaveProduct({ ...p, status });
      reload();
    } catch (e) {
      alert(e.message);
    } finally {
      setBusyId("");
    }
  }

  async function remove(p) {
    if (!window.confirm(`Delete "${p.name}" for good?`)) return;
    setBusyId(p.id);
    try {
      await api.adminDeleteProduct(p.id);
      reload();
    } catch (e) {
      alert(e.message);
    } finally {
      setBusyId("");
    }
  }

  if (!data.shop) {
    return (
      <div className="empty">Save your shop profile first — then stock the shelves.</div>
    );
  }

  return (
    <>
      {editing ? (
        <ProductForm
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      ) : (
        <button
          type="button"
          className="btn btn-gold"
          onClick={() => setEditing(EMPTY_PRODUCT)}
        >
          + New product
        </button>
      )}

      {data.products.length === 0 && !editing && (
        <div className="empty" style={{ marginTop: 16 }}>
          No products yet.
        </div>
      )}

      <div className="stack" style={{ marginTop: 16 }}>
        {data.products.map((p) => (
          <div key={p.id} className="card">
            <div className="row">
              {p.images[0] ? (
                <img className="mini-thumb" src={p.images[0]} alt="" />
              ) : (
                <div className="mini-thumb mini-thumb-empty" aria-hidden>
                  ⬡
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="spread">
                  <strong>{p.name}</strong>
                  <span className={badgeClass(p.status)}>{p.status.toUpperCase()}</span>
                </div>
                <div className="hint">
                  {p.priceCents > 0
                    ? fmtUsd(p.priceCents)
                    : "no price — can't be sold"}
                  {p.modelUrl ? " · 3D file" : ""}
                  {p.colors.length ? ` · ${p.colors.length} colors` : ""}
                  {` · ${p.images.length} photos`}
                  {` · sort ${p.sortOrder ?? 0}`}
                </div>
              </div>
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={busyId === p.id}
                onClick={() => setEditing(toForm(p))}
              >
                Edit
              </button>
              {p.status !== "published" && (
                <button
                  type="button"
                  className="btn btn-green btn-sm"
                  disabled={busyId === p.id}
                  onClick={() => setStatus(p, "published")}
                >
                  Publish
                </button>
              )}
              {p.status === "published" && (
                <>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={busyId === p.id}
                    onClick={() => setStatus(p, "soldout")}
                  >
                    Sold out
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={busyId === p.id}
                    onClick={() => setStatus(p, "draft")}
                  >
                    Unpublish
                  </button>
                </>
              )}
              {p.status !== "archived" && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={busyId === p.id}
                  onClick={() => setStatus(p, "archived")}
                >
                  Archive
                </button>
              )}
              <button
                type="button"
                className="btn btn-danger btn-sm"
                disabled={busyId === p.id}
                onClick={() => remove(p)}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

// The address Stripe collected, rendered for packing/shipping.
function ShippingAddress({ shipping }) {
  if (!shipping) return null;
  let s;
  try {
    s = JSON.parse(shipping);
  } catch {
    return null;
  }
  const a = s.address || {};
  const lines = [
    s.name,
    a.line1,
    a.line2,
    [a.city, a.state, a.postal_code].filter(Boolean).join(", "),
    a.country,
  ].filter(Boolean);
  if (!lines.length) return null;

  return (
    <div className="hint mono">
      {lines.map((l, i) => (
        <div key={i}>{l}</div>
      ))}
    </div>
  );
}

function OrdersTab({ counts, refreshCounts }) {
  const [tab, setTab] = useState("pending");
  const [orders, setOrders] = useState(null);
  const [busyId, setBusyId] = useState("");

  const load = useCallback(() => {
    setOrders(null);
    api
      .adminOrders(tab)
      .then((d) => setOrders(d.orders))
      .catch((e) => {
        alert(e.message);
        setOrders([]);
      });
  }, [tab]);
  useEffect(load, [load]);

  async function act(o, action) {
    setBusyId(o.id);
    try {
      await api.adminOrderAction(o.id, action);
      load();
      refreshCounts?.(); // keep the tab badges honest
    } catch (e) {
      alert(e.message);
    } finally {
      setBusyId("");
    }
  }

  return (
    <>
      <div className="tabs">
        {ORDER_TABS.map((t) => (
          <button
            key={t}
            type="button"
            className={`tab${tab === t ? " active" : ""}`}
            onClick={() => setTab(t)}
          >
            {t}
            {t !== "all" && counts[t] > 0 && (
              <span className="tab-badge">{counts[t]}</span>
            )}
          </button>
        ))}
      </div>

      {!orders ? (
        <div className="spinner">Loading…</div>
      ) : orders.length === 0 ? (
        <div className="empty">No {tab === "all" ? "" : tab + " "}orders.</div>
      ) : (
        <div className="stack">
          {orders.map((o) => (
            <div key={o.id} className="card">
              <div className="spread">
                <strong>
                  {o.qty} × {o.productName}
                  {o.colorName ? ` — ${o.colorName}` : ""}
                </strong>
                <span className={badgeClass(o.status)}>{o.status.toUpperCase()}</span>
              </div>
              <div className="hint">
                {fmtUsd(o.amountCents)} · card ·{" "}
                {new Date(o.createdAt).toLocaleString()} ·{" "}
                <span className="mono">{o.refCode}</span>
                <br />
                {/* Guest orders have no account — their contact details are
                    the snapshot Stripe collected, on the order itself. */}
                {o.buyerName ||
                  o.accountName ||
                  o.buyerEmail ||
                  o.accountEmail ||
                  "no name given"}
                {(o.buyerEmail || o.accountEmail) &&
                  (o.buyerName || o.accountName) &&
                  ` · ${o.buyerEmail || o.accountEmail}`}
                {!o.userId ? " · guest" : ""}
              </div>
              {o.note && <div className="muted">“{o.note}”</div>}
              <ShippingAddress shipping={o.shipping} />
              {(ORDER_ACTIONS[o.status] || []).length > 0 && (
                <div className="row" style={{ marginTop: 10 }}>
                  {(ORDER_ACTIONS[o.status] || []).map(([action, label, cls]) => (
                    <button
                      key={action}
                      type="button"
                      className={`btn ${cls} btn-sm`}
                      disabled={busyId === o.id}
                      onClick={() => act(o, action)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function ShopTab({ data, reload }) {
  const [form, setForm] = useState({
    name: data.shop?.name || "",
    blurb: data.shop?.blurb || "",
    logoUrl: data.shop?.logoUrl || null,
  });
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null); // { ok, msg }
  const set = (k, v) => setForm((prev) => ({ ...prev, [k]: v }));

  async function save() {
    setResult(null);
    setBusy(true);
    try {
      await api.adminSaveShop(form);
      setResult({ ok: true, msg: "Shop saved!" });
      reload();
    } catch (e) {
      setResult({ ok: false, msg: e.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel">
      {!data.shop && (
        <p className="muted">
          Save your shop profile to open the store — products live under it.
        </p>
      )}

      <div className="form-field">
        <label>
          Shop name <span className="req">*</span>
        </label>
        <input
          value={form.name}
          onChange={(e) => set("name", e.target.value)}
          maxLength={80}
        />
      </div>

      <div className="form-field">
        <label>Blurb</label>
        <textarea
          value={form.blurb || ""}
          onChange={(e) => set("blurb", e.target.value)}
          maxLength={500}
        />
      </div>

      <div className="form-field">
        <label>Logo</label>
        {form.logoUrl && (
          <div style={{ marginBottom: 8 }}>
            <img className="shop-logo" src={form.logoUrl} alt="Shop logo" />
          </div>
        )}
        <ImageCropUploader
          aspect={ASPECTS.square}
          buttonLabel={form.logoUrl ? "Replace logo" : "Choose logo"}
          onBusyChange={setUploading}
          onUploaded={(url) => set("logoUrl", url)}
        />
      </div>

      {result && (
        <div className={`form-result ${result.ok ? "success" : "error"}`}>
          {result.msg}
        </div>
      )}

      <button
        type="button"
        className="btn btn-gold"
        onClick={save}
        disabled={busy || uploading || !form.name}
      >
        {busy ? "Saving…" : "Save shop"}
      </button>
    </div>
  );
}

const TABS = [
  ["products", "Products"],
  ["orders", "Orders"],
  ["shop", "Shop profile"],
];

export default function ShopAdmin({ onChanged }) {
  const [tab, setTab] = useState("products");
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");

  const load = useCallback(() => {
    api
      .adminShop()
      .then((d) => {
        setData(d);
        setErr("");
        onChanged?.(); // the storefront behind the toggle may have changed
      })
      .catch((e) => setErr(e.message));
    // onChanged is a stable useCallback in Shop.jsx; re-running on identity
    // changes would loop the storefront fetch.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(load, [load]);

  if (err) return <div className="empty">{err}</div>;
  if (!data) return <div className="spinner">Loading…</div>;

  const pending = data.orderCounts?.pending || 0;

  return (
    <>
      <div className="tabs">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={`tab${tab === key ? " active" : ""}`}
            onClick={() => setTab(key)}
          >
            {label}
            {key === "orders" && pending > 0 && (
              <span className="tab-badge">{pending}</span>
            )}
          </button>
        ))}
      </div>

      {tab === "products" && <ProductsTab data={data} reload={load} />}
      {tab === "orders" && (
        <OrdersTab counts={data.orderCounts || {}} refreshCounts={load} />
      )}
      {tab === "shop" && (
        <ShopTab key={data.shop?.updatedAt || "new"} data={data} reload={load} />
      )}
    </>
  );
}
