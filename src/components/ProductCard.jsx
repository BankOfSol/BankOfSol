import { Link } from "react-router-dom";
import { fmtUsd } from "../lib/money.js";

// Store-grid card. First product image (square) or a glyph placeholder when
// there's no photo yet; SOLD OUT badge on soldout status. /shop/:id is the
// product path on every host, so links never fork.
export default function ProductCard({ product }) {
  const img = product.images?.[0];
  const price = product.priceCents > 0 ? fmtUsd(product.priceCents) : "";

  return (
    <Link to={`/shop/${product.id}`} className="product-card">
      {img ? (
        <img className="product-img" src={img} alt={product.name} loading="lazy" />
      ) : (
        <div className="product-img product-img-empty" aria-hidden>
          ⬡
        </div>
      )}
      <div className="product-meta">
        <div className="spread">
          <span className="product-name">{product.name}</span>
          {product.status === "soldout" && (
            <span className="badge badge-red">SOLD OUT</span>
          )}
        </div>
        <span className="product-price">{price || "Coming soon"}</span>
      </div>
    </Link>
  );
}
