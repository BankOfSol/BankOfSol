// Post-login landing. A full navigation (not a router push) on purpose: it
// refetches the session everywhere at once, including the Better Auth cookie
// that may have just widened to .bankofsol.app.
export async function afterLogin(from) {
  const dest = from && from.startsWith("/") && !from.startsWith("//") ? from : "/dashboard";
  window.location.assign(dest);
}
