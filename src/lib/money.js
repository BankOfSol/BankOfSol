// Client-side money formatting — integer cents in, display strings out.
// Mirrors the server's cents-only discipline (functions/lib/shop.js): floats
// never touch stored amounts, they only appear at the last render step.
export const centsToUsd = (cents) => (Number(cents || 0) / 100).toFixed(2);

export const fmtUsd = (cents) => `$${centsToUsd(cents)}`;
