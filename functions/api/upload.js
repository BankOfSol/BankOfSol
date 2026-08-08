import { requireUser, json, error } from "../lib/util.js";

// 25 MB clears full-res iPhone captures with headroom. In practice the
// browser crops and re-encodes to JPEG before upload (~200-500 KB received).
const MAX_BYTES = 25 * 1024 * 1024;
// HEIC/HEIF are a safety net for any direct upload path — the client converts
// them to JPEG first, since neither renders in Chrome or Firefox.
const ALLOWED = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
];
const EXT = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/heic": "heic",
  "image/heif": "heif",
};

// 3D files (admin-only). Detected by filename extension, NOT MIME — browsers
// send "" or application/octet-stream for .3mf/.stl. Display models
// (.3mf/.glb) power the product viewer at 8 MB; print masters (.stl) go to
// the Slant 3D farm in Phase 2 and get 50 MB.
const MODEL_TYPES = {
  "3mf": { contentType: "model/3mf", maxBytes: 8 * 1024 * 1024 },
  glb: { contentType: "model/gltf-binary", maxBytes: 8 * 1024 * 1024 },
  stl: { contentType: "model/stl", maxBytes: 50 * 1024 * 1024 },
};
const modelExt = (name) =>
  /\.(3mf|glb|stl)$/i.exec(String(name || ""))?.[1].toLowerCase() || null;

// Accepts a single file (multipart form field "file"), stores it in R2, and
// returns a stable URL ("/api/files/<key>").
export async function onRequestPost({ request, env }) {
  const gate = await requireUser(env, request);
  if (gate.error) return gate.error;

  let form;
  try {
    form = await request.formData();
  } catch {
    return error(400, "Expected multipart/form-data");
  }

  const file = form.get("file");
  if (!file || typeof file === "string") return error(400, "No file uploaded");

  // 3D branch — everything below it is the image path.
  const ext3d = modelExt(file.name);
  if (ext3d) {
    if (!gate.user.isAdmin) {
      return error(403, "Only admins can upload 3D files");
    }
    const { contentType, maxBytes } = MODEL_TYPES[ext3d];
    if (file.size === 0) return error(400, "That file is empty");
    if (file.size > maxBytes) {
      return error(400, `.${ext3d} files must be under ${Math.round(maxBytes / 1024 / 1024)} MB`);
    }
    const key = `${crypto.randomUUID()}.${ext3d}`;
    await env.BUCKET.put(key, file.stream(), {
      httpMetadata: { contentType },
    });
    return json({ url: `/api/files/${key}` }, { status: 201 });
  }

  if (!ALLOWED.includes(file.type)) {
    return error(400, "Use a JPG, PNG, WEBP, GIF, or HEIC image");
  }
  if (file.size === 0) return error(400, "That file is empty");
  if (file.size > MAX_BYTES) return error(400, "Image must be under 25 MB");

  const key = `${crypto.randomUUID()}.${EXT[file.type] || "bin"}`;
  await env.BUCKET.put(key, file.stream(), {
    httpMetadata: { contentType: file.type },
  });

  return json({ url: `/api/files/${key}` }, { status: 201 });
}
