import ImageCropUploader from "./ImageCropUploader.jsx";
import { ASPECTS } from "../lib/imageBoxes.js";

export const MAX_PRODUCT_IMAGES = 8; // mirrors MAX_IMAGES in functions/lib/shop.js

// Product photo manager: up to 8 square shots, first one is the card image.
// Controlled — parent owns the `urls` array; each add goes through the normal
// crop/downscale pipeline in ImageCropUploader.
export default function MultiImageUploader({ urls = [], onChange, onBusyChange }) {
  const move = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= urls.length) return;
    const next = urls.slice();
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <div>
      {urls.length > 0 && (
        <div className="thumb-strip">
          {urls.map((u, i) => (
            <div key={u} className="thumb-item">
              <img src={u} alt={`Product photo ${i + 1}`} />
              <div className="thumb-actions">
                <button
                  type="button"
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  aria-label="Move earlier"
                >
                  ◀
                </button>
                <button
                  type="button"
                  onClick={() => onChange(urls.filter((x) => x !== u))}
                  aria-label="Remove photo"
                >
                  ✕
                </button>
                <button
                  type="button"
                  onClick={() => move(i, 1)}
                  disabled={i === urls.length - 1}
                  aria-label="Move later"
                >
                  ▶
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {urls.length < MAX_PRODUCT_IMAGES ? (
        <ImageCropUploader
          aspect={ASPECTS.square}
          buttonLabel={urls.length ? "Add photo" : "Add photos"}
          onBusyChange={onBusyChange}
          onUploaded={(url) => onChange([...urls, url])}
        />
      ) : (
        <div className="hint">Max {MAX_PRODUCT_IMAGES} photos</div>
      )}
    </div>
  );
}
