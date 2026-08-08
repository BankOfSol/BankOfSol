// Minimal Stripe REST client for the compiled Functions. No SDK — the Workers
// runtime talks to api.stripe.com directly with form-encoded bodies, and
// webhook signatures are verified with WebCrypto. Secrets (wrangler secret):
//   STRIPE_SECRET_KEY     sk_live_... / sk_test_...
//   STRIPE_WEBHOOK_SECRET whsec_...   (from the webhook endpoint config)

// Origins Stripe may redirect back to: the production hosts + APP_ORIGINS
// (the same list Better Auth trusts). The client sends its own returnUrl and
// callers validate it against this.
export function allowedOrigins(env) {
  return new Set([
    "https://bankofsol.app",
    "https://www.bankofsol.app",
    "https://shop.bankofsol.app",
    ...(env.APP_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean),
  ]);
}

// `returnUrl` → its origin+pathname, or null when it isn't one of ours. Stripe
// appends its own query string, so anything the client sent is dropped.
export function returnBaseFor(env, returnUrl) {
  try {
    const u = new URL(String(returnUrl || ""));
    if (!allowedOrigins(env).has(u.origin)) return null;
    return u.origin + u.pathname;
  } catch {
    return null;
  }
}

// Flatten {a: {b: "x"}, c: [{d: 1}]} → a[b]=x&c[0][d]=1, Stripe's form style.
function formEncode(obj, prefix = "", out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === "object") formEncode(v, key, out);
    else out.append(key, String(v));
  }
  return out;
}

export async function stripeRequest(env, method, path, body) {
  if (!env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method,
    headers: {
      authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      ...(body ? { "content-type": "application/x-www-form-urlencoded" } : {}),
    },
    body: body ? formEncode(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || `Stripe ${method} ${path} failed (${res.status})`);
  }
  return data;
}

// The shipping address a Checkout Session collected, as a JSON string ready to
// store on the order — or null when Stripe didn't collect one. The field moved
// from `shipping_details` to `collected_information.shipping_details` between
// API versions, so read both and take whichever the account's version sent.
export function shippingJson(session) {
  const d = session?.collected_information?.shipping_details || session?.shipping_details;
  if (!d?.address) return null;
  return JSON.stringify({ name: d.name || null, address: d.address });
}

// Who bought it, as Checkout collected them: `{ email, name }`, either field
// possibly null. This is the only identity a guest order ever has, so both the
// webhook and the /confirm fallback snapshot it onto the order row.
export function buyerFrom(session) {
  const d = session?.collected_information?.shipping_details || session?.shipping_details;
  return {
    email: session?.customer_details?.email || null,
    name: session?.customer_details?.name || d?.name || null,
  };
}

// Verify a "Stripe-Signature: t=...,v1=..." header against the raw payload.
// HMAC-SHA256 of `${t}.${payload}` with the webhook secret, constant-time
// compare, 5-minute timestamp tolerance against replay.
export async function verifyStripeSignature(env, payload, sigHeader) {
  if (!env.STRIPE_WEBHOOK_SECRET || !sigHeader) return false;
  const parts = Object.fromEntries(
    sigHeader.split(",").map((p) => {
      const i = p.indexOf("=");
      return [p.slice(0, i).trim(), p.slice(i + 1)];
    })
  );
  const t = parseInt(parts.t, 10);
  if (!t || Math.abs(Date.now() / 1000 - t) > 300) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.STRIPE_WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${parts.t}.${payload}`)
  );
  const expected = [...new Uint8Array(mac)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const given = new TextEncoder().encode(parts.v1 || "");
  const want = new TextEncoder().encode(expected);
  if (given.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= given[i] ^ want[i];
  return diff === 0;
}
