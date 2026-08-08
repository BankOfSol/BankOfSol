// Host-aware routing: shop.bankofsol.app serves the same SPA from the same
// Worker, but its index route renders the storefront instead of the homepage.
// Everything else (product pages, login, dashboard) keeps identical paths on
// every host, so copied components never need host-specific links.
export const isShopHost = () =>
  typeof window !== "undefined" &&
  window.location.hostname.startsWith("shop.");

// Absolute URL for the main site — used by the shop host's nav to link back
// to bank pages. On the apex (and localhost) this is just a relative path.
export const mainSiteUrl = (path = "/") =>
  isShopHost()
    ? `${window.location.protocol}//${window.location.hostname.replace(/^shop\./, "")}${path}`
    : path;
