import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api.js";
import { fmtUsd } from "../lib/money.js";
import ProductCard from "../components/ProductCard.jsx";
import AdminViewToggle, { useAdminView } from "../components/AdminViewToggle.jsx";
import ShopAdmin, { badgeClass } from "../components/ShopAdmin.jsx";
import CheckoutReturn from "../components/CheckoutReturn.jsx";
import usePageMeta from "../lib/usePageMeta.js";

// The Bank of Sol shop. Fully public — anyone can browse AND buy, no account
// required; a session only adds the "My orders" list below. The admin's Manage
// view is folded into the same page behind the ?view=manage toggle instead of
// living on a separate /admin tab.
export default function Shop() {
  usePageMeta({ title: "Shop" });
  const { isManaging } = useAdminView();
  const [data, setData] = useState(null);
  const [orders, setOrders] = useState([]);
  const [err, setErr] = useState("");

  const loadOrders = useCallback((signedIn) => {
    if (!signedIn) return setOrders([]);
    api
      .myOrders()
      .then((o) => setOrders(o.orders || []))
      .catch(() => setOrders([]));
  }, []);

  const load = useCallback(() => {
    api
      .shop()
      .then((d) => {
        setData(d);
        loadOrders(d.signedIn);
      })
      .catch((e) => setErr(e.message));
  }, [loadOrders]);

  useEffect(load, [load]);

  if (err) {
    return (
      <div className="page">
        <div className="empty">{err}</div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="page">
        <div className="spinner">Loading…</div>
      </div>
    );
  }

  const { shop, products, signedIn } = data;

  return (
    <div className="page">
      <h1>Shop</h1>

      {/* Admins get the Manage switch even before the shop row exists —
          the profile tab in there is how the shop gets created. */}
      <AdminViewToggle labels={["Store", "Manage"]} />

      {isManaging ? (
        <ShopAdmin onChanged={load} />
      ) : (
        <>
          <CheckoutReturn onPaid={load} />

          {shop ? (
            <>
              <div className="row" style={{ marginBottom: 20 }}>
                {shop.logoUrl && (
                  <img className="shop-logo" src={shop.logoUrl} alt="" />
                )}
                <div>
                  <h2 style={{ margin: 0 }}>{shop.name}</h2>
                  {shop.blurb && (
                    <p className="muted" style={{ margin: 0 }}>
                      {shop.blurb}
                    </p>
                  )}
                </div>
              </div>

              {products.length ? (
                <div className="product-grid">
                  {products.map((p) => (
                    <ProductCard key={p.id} product={p} />
                  ))}
                </div>
              ) : (
                <div className="empty">
                  Nothing on the shelves yet — check back soon.
                </div>
              )}
            </>
          ) : (
            <div className="empty">
              The shop is being stocked — check back soon.
            </div>
          )}

          {/* No login wall on buying. The nudge is about the one thing an
              account adds: your orders listed on this page. */}
          {!signedIn && products.length > 0 && (
            <p className="muted" style={{ marginTop: 24 }}>
              No account needed to order — checkout takes your email and
              shipping address. <Link to="/login">Log in</Link> if you'd like
              your orders to show up here.
            </p>
          )}

          {orders.length > 0 && <MyOrders orders={orders} />}
        </>
      )}
    </div>
  );
}

function MyOrders({ orders }) {
  return (
    <>
      <hr className="divider" />
      <h2>My orders</h2>
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
              {fmtUsd(o.amountCents)} · ref{" "}
              <span className="mono">{o.refCode}</span> ·{" "}
              {new Date(o.createdAt).toLocaleDateString()}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
