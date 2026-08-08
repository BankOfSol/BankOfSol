import { str } from "./util.js";

// Shared validate/sanitize + money math for the shop endpoints, so the admin
// CRUD and the public order flow can't drift apart. One rail in Phase 1: USD
// via Stripe Checkout. (Solana Pay arrives in Phase 3 as its own system.)

export const PRODUCT_STATUSES = ["draft", "published", "soldout", "archived", "hidden"];
export const ORDER_STATUSES = [
  "pending",
  "paid",
  "fulfilling",
  "fulfilled",
  "cancelled",
  "refunded",
  "expired",
];

// Legal admin transitions. 'fulfilling' is the Phase-2 print-farm state (order
// submitted to Slant 3D, awaiting shipment). Terminal states have no exits —
// reopening an order means making a new one, so refCodes stay one-shot.
export const ORDER_TRANSITIONS = {
  pending: ["paid", "cancelled"],
  paid: ["fulfilling", "fulfilled", "cancelled", "refunded"],
  fulfilling: ["fulfilled", "cancelled", "refunded"],
  fulfilled: [],
  cancelled: [],
  refunded: [],
  expired: [],
};

export const MAX_IMAGES = 8;
export const MAX_COLORS = 12;
export const MAX_QTY = 20;
export const MAX_PENDING_PER_USER = 5;

// Guest checkout has no account to count against, so unpaid guest orders are
// capped per client IP over a rolling hour instead. Deliberately looser than
// the per-account cap: an IP can be a whole house or a coffee shop, and
// abandoned sessions clear themselves after ~35 minutes (checkout.session.expired).
export const MAX_PENDING_PER_IP = 12;
export const GUEST_PENDING_WINDOW_MS = 60 * 60 * 1000;

// --- USD money math -------------------------------------------------------
// Prices are integer cents everywhere they travel. The admin types '24' or
// '24.50'; the cents are parsed off the string rather than through
// parseFloat, which is banned in this file — floats lose money.

// '24.50' → true. Up to 2 decimals, must be > 0, caps at $999,999.99.
export function isUsdPrice(s) {
  if (typeof s !== "string" || !/^\d{1,6}(\.\d{1,2})?$/.test(s)) return false;
  return /[1-9]/.test(s);
}

// '24.5' → 2450.
export function usdToCents(dec) {
  const [whole, frac = ""] = String(dec).split(".");
  return Number(whole) * 100 + Number(frac.padEnd(2, "0").slice(0, 2));
}

// 2450 → '24.50'. Integer math only, so it stays exact at any magnitude.
export function centsToUsd(cents) {
  const n = Math.trunc(Number(cents) || 0);
  return `${Math.trunc(n / 100)}.${String(n % 100).padStart(2, "0")}`;
}

export const isBuyable = (priceCents) =>
  Number.isInteger(priceCents) && priceCents > 0;

// --- refCodes -------------------------------------------------------------

// "BOS-XK7M2R" — 6 chars from an alphabet with no 0/O/1/I/L so the code
// survives being read aloud or retyped. Caller retries on the UNIQUE
// constraint (collision odds ~1 in 887M per attempt).
export function makeRefCode() {
  const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  let code = "";
  for (const b of bytes) code += ALPHABET[b % ALPHABET.length];
  return `BOS-${code}`;
}

// --- sanitizers -----------------------------------------------------------

const fileUrl = (v) => {
  const s = str(v, 300);
  if (!s) return null;
  return s.startsWith("/api/files/") ? s : undefined; // undefined = invalid
};

// Returns { product } or { error: "message" }. Shared by create AND update so
// the two paths can't drift.
export function sanitizeProduct(body) {
  const b = body && typeof body === "object" ? body : {};

  const name = str(b.name, 120);
  if (!name) return { error: "Give the product a name" };

  // `price` is what the admin form sends ('24.50'); `priceCents` is accepted
  // too so a round-trip of an unedited row is lossless.
  const price = str(b.price, 16);
  let priceCents;
  if (price) {
    if (!isUsdPrice(price)) {
      return { error: "Price must be a dollar amount like 24.00" };
    }
    priceCents = usdToCents(price);
  } else if (Number.isInteger(+b.priceCents) && +b.priceCents > 0) {
    priceCents = +b.priceCents;
  } else {
    return { error: "Price must be a dollar amount like 24.00" };
  }

  const rawImages = Array.isArray(b.images) ? b.images : [];
  if (rawImages.length > MAX_IMAGES) {
    return { error: `Up to ${MAX_IMAGES} images per product` };
  }
  const images = [];
  for (const u of rawImages) {
    const url = fileUrl(u);
    if (!url) return { error: "Invalid image URL" };
    images.push(url);
  }

  const modelUrl = fileUrl(b.modelUrl);
  if (modelUrl === undefined) return { error: "Invalid 3D model URL" };
  let modelKind = null;
  if (modelUrl) {
    const m = /\.(3mf|glb)$/i.exec(modelUrl);
    if (!m) return { error: "3D model must be a .3mf or .glb file" };
    modelKind = m[1].toLowerCase();
  }

  const rawColors = Array.isArray(b.colors) ? b.colors : [];
  if (rawColors.length > MAX_COLORS) {
    return { error: `Up to ${MAX_COLORS} colors per product` };
  }
  const colors = [];
  for (const c of rawColors) {
    const colorName = str(c?.name, 40);
    const hex = str(c?.hex, 7);
    if (!colorName) return { error: "Every color needs a name" };
    if (!/^#[0-9a-fA-F]{6}$/.test(hex)) {
      return { error: `Color "${colorName}" needs a hex value like #F0B90B` };
    }
    colors.push({ name: colorName, hex: hex.toLowerCase() });
  }

  const status = str(b.status, 20) || "draft";
  if (!PRODUCT_STATUSES.includes(status)) return { error: "Invalid status" };

  return {
    product: {
      name,
      description: str(b.description, 2000) || null,
      priceCents,
      images: JSON.stringify(images),
      modelUrl,
      modelKind,
      colors: JSON.stringify(colors),
      status,
      sortOrder: Number.isFinite(+b.sortOrder) ? Math.trunc(+b.sortOrder) : 0,
    },
  };
}

// Returns { shop } or { error: "message" }.
export function sanitizeShop(body) {
  const b = body && typeof body === "object" ? body : {};

  const name = str(b.name, 80);
  if (!name) return { error: "Give your shop a name" };

  const logoUrl = fileUrl(b.logoUrl);
  if (logoUrl === undefined) return { error: "Invalid logo URL" };

  return {
    shop: {
      name,
      blurb: str(b.blurb, 500) || null,
      logoUrl,
    },
  };
}

// --- public shapes --------------------------------------------------------

const parseJson = (s, fallback) => {
  try {
    return JSON.parse(s) ?? fallback;
  } catch {
    return fallback;
  }
};

export function publicProduct(row) {
  const { extra, shopId, ...rest } = row;
  return {
    ...rest,
    images: parseJson(row.images, []),
    colors: parseJson(row.colors, []),
  };
}

export function publicShop(row) {
  const { extra, ownerUserId, ...rest } = row;
  return rest;
}
