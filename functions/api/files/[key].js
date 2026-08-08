// Public read-through for uploads stored in R2 (product images, 3D models —
// and in Phase 2 the STL files the Slant 3D farm fetches by URL). Immutable
// cache: keys are content-addressed UUIDs, so a file never changes under its
// URL. No Range handling on purpose — the immutable cache-control lets the
// edge cache the object and slice ranges itself before the Worker runs.
export async function onRequestGet({ params, env }) {
  const key = params.key;
  const obj = await env.BUCKET.get(key);
  if (!obj) return new Response("Not found", { status: 404 });

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("etag", obj.httpEtag);
  headers.set("cache-control", "public, max-age=31536000, immutable");
  return new Response(obj.body, { headers });
}
