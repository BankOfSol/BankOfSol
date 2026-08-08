// Host-aware routing: shop.bankofsol.app is a STANDALONE storefront served by
// the same Worker — on that host only the shop renders (everything else
// bounces to the apex), and on the main site the shop doesn't appear at all
// (old /shop links forward to the subdomain). Locally there are no
// subdomains, so the shop stays reachable at /shop for dev.
export const isShopHost = () =>
  typeof window !== "undefined" &&
  window.location.hostname.startsWith("shop.");

export const isLocalDev = () =>
  typeof window !== "undefined" &&
  /^(localhost|127\.|0\.0\.0\.0)/.test(window.location.hostname);

// Absolute URL for the main site — used by the shop host's chrome to link
// back. On the apex (and localhost) this is just a relative path.
export const mainSiteUrl = (path = "/") =>
  isShopHost()
    ? `${window.location.protocol}//${window.location.hostname.replace(/^shop\./, "")}${path}`
    : path;

// Where the storefront lives from the current host's point of view:
// on the shop host it's local; on localhost dev it's the inline /shop route;
// in production it's the subdomain.
export const shopSiteUrl = (path = "/") => {
  if (isShopHost()) return path;
  if (isLocalDev()) return path === "/" ? "/shop" : `/shop${path}`;
  return `https://shop.${window.location.hostname.replace(/^www\./, "")}${path}`;
};
