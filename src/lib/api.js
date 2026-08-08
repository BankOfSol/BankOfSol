// Thin fetch wrapper for our own /api/* endpoints. Cookies are same-origin so
// they're sent automatically; credentials:"include" keeps it explicit (and
// covers the shop subdomain, whose session cookie spans .bankofsol.app).
async function req(path, options = {}) {
  const res = await fetch(path, { credentials: "include", ...options });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* empty body */
  }
  if (!res.ok) {
    const err = new Error((data && data.error) || `Request failed (${res.status})`);
    err.status = res.status; // callers branch on 403/409 vs real failures
    throw err;
  }
  return data;
}

const post = (path, payload) =>
  req(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

export const api = {
  me: () => req("/api/me"),

  // R2 uploads — /api/upload branches on extension (images vs 3D/STL models).
  upload: (file) => {
    const fd = new FormData();
    fd.append("file", file);
    return req("/api/upload", { method: "POST", body: fd });
  },

  // ── Shop (public storefront + card checkout) ──────────────────────────────
  shop: () => req("/api/shop"),
  shopProduct: (id) => req(`/api/shop/products/${id}`),
  shopCheckout: (payload) =>
    post("/api/shop/checkout", {
      ...payload,
      returnUrl: window.location.href.split("?")[0],
    }),
  shopConfirm: (sessionId) => post("/api/shop/confirm", { sessionId }),
  myOrders: () => req("/api/shop/orders"),

  // ── Shop (admin — the Manage view) ────────────────────────────────────────
  adminShop: () => req("/api/admin/shop"),
  adminSaveShop: (payload) =>
    req("/api/admin/shop", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }),
  adminSaveProduct: (payload) => post("/api/admin/shop/products", payload),
  adminDeleteProduct: (id) =>
    req(`/api/admin/shop/products?id=${id}`, { method: "DELETE" }),
  adminOrders: (status = "all") => req(`/api/admin/shop/orders?status=${status}`),
  adminOrderAction: (id, action) => post("/api/admin/shop/orders", { id, action }),

  // ── Booking (public) ──────────────────────────────────────────────────────
  bookingServices: () => req("/api/booking/services"),
  bookingSlots: (serviceId, from, to) =>
    req(`/api/booking/slots?serviceId=${serviceId}&from=${from}&to=${to}`),
  bookingCheckout: (payload) =>
    post("/api/booking/checkout", {
      ...payload,
      returnUrl: window.location.origin + "/booking/return",
    }),
  bookingConfirm: (sessionId) => post("/api/booking/confirm", { sessionId }),
  bookingCancel: (payload) => post("/api/booking/cancel", payload),
  myBookings: () => req("/api/booking/mine"),

  // ── Booking (admin) ───────────────────────────────────────────────────────
  adminBookingServices: () => req("/api/admin/booking/services"),
  adminSaveService: (payload) => post("/api/admin/booking/services", payload),
  adminDeleteService: (id) =>
    req(`/api/admin/booking/services?id=${id}`, { method: "DELETE" }),
  adminAvailability: () => req("/api/admin/booking/availability"),
  adminSaveAvailability: (payload) => post("/api/admin/booking/availability", payload),
  adminDeleteAvailability: (kind, id) =>
    req(`/api/admin/booking/availability?kind=${kind}&id=${id}`, { method: "DELETE" }),
  adminBookings: (params = {}) =>
    req(`/api/admin/booking/list?${new URLSearchParams(params)}`),
  adminBookingAction: (payload) => post("/api/admin/booking/action", payload),

  // ── Membership ────────────────────────────────────────────────────────────
  membershipApply: (payload) => post("/api/membership/apply", payload),
  membershipStatus: () => req("/api/membership/status"),
  adminMembershipQueue: (status = "applied") =>
    req(`/api/admin/membership/queue?status=${status}`),
  adminMembershipDecide: (id, action, note) =>
    post("/api/admin/membership/decide", { id, action, ...(note ? { note } : {}) }),

  // ── Billing (member) ──────────────────────────────────────────────────────
  billing: () => req("/api/billing"),
  payInvoice: (id) =>
    post(`/api/billing/invoices/${id}/pay`, {
      returnUrl: window.location.origin + "/billing",
    }),
  claimInvoice: (id, payload) => post(`/api/billing/invoices/${id}/claim`, payload),
  billingConfirm: (sessionId) => post("/api/billing/confirm", { sessionId }),

  // ── Reviews ───────────────────────────────────────────────────────────────
  postReview: (payload) => post("/api/reviews", payload),
  myReviews: () => req("/api/reviews"),

  // ── Members (admin account management) ────────────────────────────────────
  adminMembers: (search) =>
    req(`/api/admin/members${search ? `?search=${encodeURIComponent(search)}` : ""}`),
  adminMember: (userId) => req(`/api/admin/members/${userId}`),
  adminSaveInvoice: (payload) => post("/api/admin/members/invoice", { action: "save", ...payload }),
  adminInvoiceAction: (id, action) => post("/api/admin/members/invoice", { id, action }),
  adminRecordPayment: (payload) => post("/api/admin/members/payment", payload),
  adminLoan: (payload) => post("/api/admin/members/loan", payload),
  adminSaveEngagement: (payload) => post("/api/admin/members/engagement", payload),
  adminClaims: () => req("/api/admin/members/claims"),
  adminClaimAction: (id, action, amount) =>
    post("/api/admin/members/claims", { id, action, ...(amount ? { amount } : {}) }),

  // ── Payment rails (superadmin) ────────────────────────────────────────────
  rails: () => req("/api/superadmin/rails"),
  saveRail: (payload) => post("/api/superadmin/rails", payload),
  deleteRail: (id) => req(`/api/superadmin/rails?id=${id}`, { method: "DELETE" }),

  // ── Admin misc ────────────────────────────────────────────────────────────
  adminCounts: () => req("/api/admin/counts"),
  emailLog: (params = {}) =>
    req(`/api/admin/email-log?${new URLSearchParams(params)}`),

  // ── Super admin (Sol only) ────────────────────────────────────────────────
  superAdmins: (search) =>
    req(`/api/superadmin/admins${search ? `?search=${encodeURIComponent(search)}` : ""}`),
  setAdminFlags: (userId, flags) => post("/api/superadmin/admins", { userId, ...flags }),
  adminActivity: () => req("/api/superadmin/activity"),
};
