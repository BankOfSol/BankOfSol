import { useCallback, useEffect, useRef, useState } from "react";
import Cropper from "react-easy-crop";
import { api } from "../lib/api.js";
import { ASPECTS } from "../lib/imageBoxes.js";

// One uploader for every photo box on the site. It:
//   1. accepts any image the user picks (including iPhone HEIC/HEIF),
//   2. converts HEIC -> JPEG so Chrome/Firefox can display it,
//   3. shows a crop screen locked to the box's aspect ratio,
//   4. downscales huge 24-48MP photos and re-encodes to JPEG (~200-500 KB),
//   5. POSTs via api.upload and hands back the /api/files/<key> URL.
//
// Because the browser re-encodes before uploading, the stored file stays small
// no matter how big the original phone photo was.

const MAX_EDGE = 1600; // cap the long edge — plenty for retina display
const JPEG_QUALITY = 0.85;

function isHeic(file) {
  return /heic|heif/i.test(file.type) || /\.hei[cf]$/i.test(file.name || "");
}

async function decodeToImage(file) {
  let blob = file;
  if (isHeic(file)) {
    // Chrome & Firefox can't decode HEIC. Convert to JPEG first. Dynamic import
    // keeps heic2any (~1 MB) out of the main bundle.
    const heic2any = (await import("heic2any")).default;
    const out = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.92 });
    // A multi-image HEIC yields an array of blobs; take the first.
    blob = Array.isArray(out) ? out[0] : out;
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("decode failed"));
      i.src = url;
    });
    return { img, url };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}

// Crop `img` to `area` (natural pixels from react-easy-crop), downscale so the
// long edge tops out at MAX_EDGE, and re-encode as a JPEG blob.
async function renderJpegBlob(img, area) {
  const src = area || {
    x: 0,
    y: 0,
    width: img.naturalWidth,
    height: img.naturalHeight,
  };
  const scale = Math.min(1, MAX_EDGE / Math.max(src.width, src.height));
  const outW = Math.max(1, Math.round(src.width * scale));
  const outH = Math.max(1, Math.round(src.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, src.x, src.y, src.width, src.height, 0, 0, outW, outH);

  const blob = await new Promise((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY)
  );
  if (!blob) throw new Error("Couldn't process that image — try a JPG or PNG.");
  return blob;
}

export default function ImageCropUploader({
  aspect = ASPECTS.square,
  onUploaded,
  buttonLabel = "Choose photo",
  onBusyChange,
}) {
  const inputRef = useRef(null);
  const [imgEl, setImgEl] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [areaPx, setAreaPx] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // Let the parent form disable its submit button while we're working. Held in
  // a ref so an inline arrow prop doesn't re-fire the effect every render.
  const busyCb = useRef(onBusyChange);
  busyCb.current = onBusyChange;
  useEffect(() => {
    busyCb.current?.(busy);
  }, [busy]);

  // Don't leak the object URL if we unmount mid-crop.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const onCropComplete = useCallback((_area, areaPixels) => {
    setAreaPx(areaPixels);
  }, []);

  async function pickFile(e) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    setErr("");
    setBusy(true);
    try {
      const { img, url } = await decodeToImage(file);
      setImgEl(img);
      setPreviewUrl(url);
      setZoom(1);
      setCrop({ x: 0, y: 0 });
    } catch {
      setErr("Couldn't read that image — try a JPG or PNG.");
    } finally {
      setBusy(false);
    }
  }

  function close() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setImgEl(null);
    setAreaPx(null);
  }

  async function save() {
    if (!imgEl || !areaPx) return;
    setBusy(true);
    setErr("");
    try {
      const blob = await renderJpegBlob(imgEl, areaPx);
      // Wrap in a File so the server sees a real filename + content type.
      const file = new File([blob], "photo.jpg", { type: "image/jpeg" });
      const { url } = await api.upload(file);
      onUploaded?.(url);
      close();
    } catch (e) {
      setErr(e.message || "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
      >
        {busy && !previewUrl ? "Loading…" : buttonLabel}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,.heic,.heif"
        onChange={pickFile}
        style={{ display: "none" }}
      />
      {err && <div className="form-result error">{err}</div>}

      {previewUrl && (
        <div className="crop-overlay" role="dialog" aria-modal="true">
          <div className="crop-surface">
            <Cropper
              image={previewUrl}
              crop={crop}
              zoom={zoom}
              aspect={aspect}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
              restrictPosition
            />
          </div>
          <div className="crop-controls">
            <input
              type="range"
              min={1}
              max={4}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              aria-label="Zoom"
              className="crop-zoom"
            />
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={close}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-green btn-sm"
              onClick={save}
              disabled={busy || !areaPx}
            >
              {busy ? "Saving…" : "Use photo"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
