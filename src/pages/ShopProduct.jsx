import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../lib/api.js";
import { fmtUsd } from "../lib/money.js";
import ColorSwatches from "../components/ColorSwatches.jsx";
import OrderSheet from "../components/OrderSheet.jsx";
import CheckoutReturn from "../components/CheckoutReturn.jsx";
import usePageMeta from "../lib/usePageMeta.js";

// Product detail: flip through photos (tap a thumbnail to swap the main
// image), pick a color, and buy by card. Stripe returns the buyer to this
// same URL, which is why CheckoutReturn lives here as well as on the
// storefront.
export default function ShopProduct() {
  const { id } = useParams();
  const [state, setState] = useState({ loading: true });
  usePageMeta({ title: state.product?.name || "Shop" });
  const [color, setColor] = useState(null); // selected color name, null = as designed
  const [imgIdx, setImgIdx] = useState(0);
  const [buying, setBuying] = useState(false);

  useEffect(() => {
    api
      .shopProduct(id)
      .then((d) => {
        setState({ loading: false, ...d });
        setImgIdx(0);
      })
      .catch((e) => setState({ loading: false, error: e.message }));
  }, [id]);

  if (state.loading) {
    return (
      <div className="page">
        <div className="spinner">Loading…</div>
      </div>
    );
  }
  if (!state.product) {
    return (
      <div className="page narrow">
        <div className="empty">{state.error || "Product not found."}</div>
        <p style={{ marginTop: 16 }}>
          <Link to="/shop" className="btn btn-ghost">
            ← Back to the shop
          </Link>
        </p>
      </div>
    );
  }

  const { product, shop } = state;
  const colors = product.colors || [];
  const images = product.images || [];
  const mainImg = images[Math.min(imgIdx, images.length - 1)] || null;
  const soldout = product.status === "soldout";
  const price = product.priceCents > 0 ? fmtUsd(product.priceCents) : "";

  return (
    <div className="page">
      <div className="narrow">
        <p>
          <Link to="/shop" className="muted">
            ← The shop
          </Link>
        </p>

        <CheckoutReturn />

        {mainImg ? (
          <>
            <img
              className="gallery-main"
              src={mainImg}
              alt={`${product.name} — photo ${imgIdx + 1}`}
            />
            {images.length > 1 && (
              <div className="gallery-thumbs">
                {images.map((u, i) => (
                  <button
                    key={u}
                    type="button"
                    className={`gallery-thumb${i === imgIdx ? " active" : ""}`}
                    onClick={() => setImgIdx(i)}
                    aria-label={`Show photo ${i + 1}`}
                  >
                    <img src={u} alt="" />
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="gallery-main gallery-main-empty">No photos yet</div>
        )}

        <div className="panel" style={{ marginTop: 16 }}>
          <h1>{product.name}</h1>
          <div className="detail-price">{price || "Not priced yet"}</div>

          {colors.length > 0 && (
            <div className="form-field" style={{ marginTop: 14 }}>
              <label>Colors</label>
              <ColorSwatches colors={colors} value={color} onChange={setColor} />
            </div>
          )}

          {product.description && (
            <p className="muted" style={{ marginTop: 14 }}>
              {product.description}
            </p>
          )}

          <div style={{ marginTop: 18 }}>
            {soldout ? (
              <button type="button" className="btn btn-gold btn-block" disabled>
                SOLD OUT
              </button>
            ) : !price ? (
              <button type="button" className="btn btn-gold btn-block" disabled>
                Coming soon
              </button>
            ) : (
              // No account needed — Stripe takes the email and address.
              <button
                type="button"
                className="btn btn-gold btn-block"
                onClick={() => setBuying(true)}
              >
                Buy — {price}
              </button>
            )}
          </div>

          {shop?.name && (
            <p className="hint" style={{ marginTop: 12 }}>
              Sold by {shop.name}
            </p>
          )}
        </div>
      </div>

      {buying && (
        <OrderSheet
          product={product}
          initialColor={color}
          onClose={() => setBuying(false)}
        />
      )}
    </div>
  );
}
