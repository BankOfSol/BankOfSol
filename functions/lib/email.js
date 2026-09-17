// Outbound transactional email for Bank of Sol, sent via the Cloudflare Email
// Sending binding (`send_email` on the bankofsol-mailer Worker; the site
// reaches it through the EMAIL service binding — same env.EMAIL.send() shape
// either way).
//
// Three rules this module enforces so callers can't get them wrong:
//
//  1. Sending NEVER throws. These functions are called from inside Better
//     Auth's signup/reset hooks — a mail outage must not turn signup into a 500.
//  2. Every email discloses it's automated, in `layout()`, not in the
//     individual templates, so a new template can't forget it.
//  3. Every send leaves a row in `email_log` — subjects + outcomes ONLY.
//     Never bodies, never URLs, never tokens: verification and reset links are
//     secrets, and a log that leaks them is an account-takeover kit.

// Brand palette, mirrored from src/styles/site.css. Email clients strip
// <style> and never load web fonts, so everything is inline + system-stacked.
const BG = "#0B0E11"; // --bg      vault black (page)
const CARD = "#14181D"; // --panel   card plate
const FOOT = "#10131A"; // --bg2     footer well
const LINE = "#232A33"; // --line    panel seams
const INK = "#E8ECF1"; // --ink     primary text
const DIM = "#97A3B0"; // --ink-dim secondary text
const BLACK = "#06080B"; // --black   deepest black
const GOLD = "#F0B90B"; // --gold    sun — primary CTA
const GREEN = "#16C784"; // --green   confirm/success accent

// SINGLE quotes around 'Segoe UI' — interpolated into style="..." attributes;
// a double-quoted family name terminates the attribute early.
const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";

const isUnmailable = (email) => !email || typeof email !== "string";

const escapeHtml = (s = "") =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
  );

const firstName = (user) =>
  (user?.name || "").trim().split(/\s+/)[0] || "there";

const DISCLOSURE =
  "This is an automated message from Bank of Sol. Replies reach a real person.";

// Every email footer carries the compliance line — same text as the site
// footer. Bank of Sol trades on the "bank" name; the mail must not oversell it.
const DISCLAIMER =
  "Bank of Sol is a technology and services company, not a chartered bank or licensed depository institution.";

/**
 * Wraps body content in the Bank of Sol shell: dark card, gold header rule,
 * gold CTA button, disclosure + disclaimer footer on every send.
 */
function layout({
  heading,
  bodyHtml,
  bodyText,
  cta,
  accent = GOLD,
  // Product-line branding for the header + site link. Everything else in the
  // shell (disclosure, not-a-bank line, sender) stays Bank of Sol's.
  brand = "BANK OF SOL",
  site = "https://bankofsol.app",
  siteLabel = "bankofsol.app",
}) {
  const button = cta
    ? `<tr><td align="center" style="padding:8px 0 4px;">
         <a href="${cta.url}" bgcolor="${accent}" style="display:inline-block;background:${accent};color:${BLACK};font-family:${FONT};font-size:16px;font-weight:800;text-decoration:none;padding:14px 32px;border-radius:8px;letter-spacing:.02em;">${escapeHtml(cta.label)}</a>
       </td></tr>
       <tr><td style="padding:14px 0 0;font-family:${FONT};font-size:12px;line-height:1.5;color:${DIM};">
         Button not working? Paste this into your browser:<br>
         <span style="color:${DIM};word-break:break-all;">${escapeHtml(cta.url)}</span>
       </td></tr>`
    : "";

  // `bgcolor` alongside every inline background: Outlook's Word engine ignores
  // CSS backgrounds on some elements. The meta tags stop iOS/Gmail from
  // re-inverting a design that is already dark.
  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="color-scheme" content="dark light">
<meta name="supported-color-schemes" content="dark light">
</head>
<body style="margin:0;padding:0;background:${BG};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${BG}" style="background:${BG};padding:28px 12px;">
 <tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${CARD}" style="max-width:560px;background:${CARD};border:1px solid ${LINE};border-radius:12px;overflow:hidden;">
   <tr><td bgcolor="${BLACK}" style="background:${BLACK};border-bottom:3px solid ${GOLD};padding:18px 24px;">
     <span style="font-family:${FONT};font-size:22px;font-weight:900;color:${GOLD};letter-spacing:.08em;">${escapeHtml(brand)}</span>
   </td></tr>
   <tr><td style="padding:28px 24px 8px;">
     <h1 style="margin:0 0 14px;font-family:${FONT};font-size:22px;font-weight:900;color:${INK};line-height:1.25;">${escapeHtml(heading)}</h1>
     <div style="font-family:${FONT};font-size:16px;line-height:1.6;color:${INK};">${bodyHtml}</div>
   </td></tr>
   <tr><td style="padding:12px 24px 26px;">
     <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${button}</table>
   </td></tr>
   <tr><td bgcolor="${FOOT}" style="background:${FOOT};border-top:1px solid ${LINE};padding:16px 24px;font-family:${FONT};font-size:12px;line-height:1.6;color:${DIM};">
     ${escapeHtml(DISCLOSURE)}<br>
     ${escapeHtml(DISCLAIMER)}<br>
     <a href="${site}" style="color:${GOLD};font-weight:700;text-decoration:none;">${escapeHtml(siteLabel)}</a>
   </td></tr>
  </table>
 </td></tr>
</table>
</body></html>`;

  const text = [
    brand,
    "",
    heading,
    "",
    bodyText,
    ...(cta ? ["", `${cta.label}: ${cta.url}`] : []),
    "",
    "—",
    DISCLOSURE,
    DISCLAIMER,
    site,
  ].join("\n");

  return { html, text };
}

/**
 * One row per outbound ATTEMPT — the ledger behind Admin → Email log.
 * Swallows its own failures (a broken log must never break a signup) and skips
 * silently when there's no DB binding. Subjects and outcomes only (rule #3).
 */
async function logEmail(env, { to, subject, ok, error, kind, note }) {
  if (!env.DB) return;
  try {
    await env.DB.prepare(
      `INSERT INTO "email_log" ("id","toEmail","kind","subject","ok","error","note","createdAt")
       VALUES (?,?,?,?,?,?,?,?)`
    )
      .bind(
        crypto.randomUUID(),
        String(to || ""),
        kind,
        String(subject || "").slice(0, 200),
        ok ? 1 : 0,
        error || null,
        note || null,
        new Date().toISOString()
      )
      .run();
  } catch (e) {
    console.error(`[email] email_log write failed: ${e?.message || e}`);
  }
}

/**
 * Low-level send. Never throws (rule #1). Resolves { ok } — with no EMAIL
 * binding (plain local `wrangler dev`) it logs the message to the console and
 * reports ok, which is the intended local default.
 */
async function deliver(env, { to, subject, html, text, log }) {
  // Local dev: the EMAIL service binding always EXISTS under `wrangler dev`
  // but its target (bankofsol-mailer) usually isn't running, so sends throw.
  // Treat non-https BETTER_AUTH_URL as dev and console-log the full mail —
  // that's how you grab verification/reset links locally. In production the
  // full text is NEVER logged (links are secrets; see rule #3).
  const dev = !(env.BETTER_AUTH_URL || "").startsWith("https://");
  let result;
  if (isUnmailable(to)) {
    result = { ok: false, error: "unmailable address" };
  } else if (!env.EMAIL || dev) {
    console.log(`[email:dev] to=${to} subject="${subject}"\n${text}`);
    result = { ok: true, dev: true };
  } else {
    try {
      await env.EMAIL.send({
        to,
        from: { email: env.MAIL_FROM, name: env.MAIL_FROM_NAME || "Bank of Sol" },
        replyTo: env.ADMIN_EMAIL || undefined,
        subject,
        html,
        text,
      });
      result = { ok: true };
    } catch (e) {
      result = { ok: false, error: (e?.message || String(e)).slice(0, 300) };
      console.error(`[email] send failed to=${to}: ${result.error}`);
    }
  }
  if (log?.kind) {
    await logEmail(env, { to, subject, ok: result.ok, error: result.error, kind: log.kind, note: log.note });
  }
  return result;
}

const send = (env, to, tpl, log) =>
  deliver(env, { to, subject: tpl.subject, ...layout(tpl), log });

// ── Auth templates (wired into functions/lib/auth.js hooks) ─────────────────

export const sendVerificationEmail = (env, user, url) =>
  send(env, user.email, {
    subject: "Verify your email — Bank of Sol",
    heading: `Welcome, ${firstName(user)}.`,
    bodyHtml: `<p>Confirm this address to activate your Bank of Sol account. The link is good for 24 hours.</p>`,
    bodyText: "Confirm this address to activate your Bank of Sol account. The link is good for 24 hours.",
    cta: { label: "Verify email", url },
  }, { kind: "verify" });

export const sendWelcomeEmail = (env, user) =>
  send(env, user.email, {
    subject: "Your Bank of Sol account is live",
    heading: "You're verified.",
    bodyHtml: `<p>Your account is active. From your dashboard you can book consulting time, track orders, and apply for membership — every member is approved personally by Sol.</p>`,
    bodyText: "Your account is active. From your dashboard you can book consulting time, track orders, and apply for membership — every member is approved personally by Sol.",
    cta: { label: "Open dashboard", url: `${env.BETTER_AUTH_URL || "https://bankofsol.app"}/dashboard` },
    accent: GREEN,
  }, { kind: "welcome" });

export const sendResetPasswordEmail = (env, user, url) =>
  send(env, user.email, {
    subject: "Reset your password — Bank of Sol",
    heading: "Password reset",
    bodyHtml: `<p>Someone (hopefully you) asked to reset the password for this account. If it wasn't you, ignore this email — nothing changes.</p>`,
    bodyText: "Someone (hopefully you) asked to reset the password for this account. If it wasn't you, ignore this email — nothing changes.",
    cta: { label: "Choose a new password", url },
  }, { kind: "reset" });

export const sendChangeEmailConfirmation = (env, user, newEmail, url) =>
  send(env, user.email, {
    subject: "Confirm your email change — Bank of Sol",
    heading: "Email change requested",
    bodyHtml: `<p>Your account asked to change its email to <strong>${escapeHtml(newEmail)}</strong>. Confirm from this (current) address to approve it. If this wasn't you, don't click — and consider changing your password.</p>`,
    bodyText: `Your account asked to change its email to ${newEmail}. Confirm from this (current) address to approve it. If this wasn't you, don't click.`,
    cta: { label: "Approve email change", url },
  }, { kind: "email-change" });

// ── Booking templates ───────────────────────────────────────────────────────
// `booking` rows carry serviceName/startAt/endAt (UTC ISO)/buyerTz/refCode/
// icsToken. Times are rendered in the BUYER's timezone plus PT for Sol.

function bookingWhen(booking, tz) {
  try {
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "full",
      timeStyle: "short",
      timeZone: tz,
    }).format(new Date(booking.startAt));
  } catch {
    return new Date(booking.startAt).toUTCString();
  }
}

export function sendBookingConfirmed(env, booking) {
  const site = env.SITE_URL || env.BETTER_AUTH_URL || "https://bankofsol.app";
  const tz = booking.buyerTz || "America/Los_Angeles";
  const when = bookingWhen(booking, tz);
  return send(env, booking.buyerEmail, {
    subject: `Booked: ${booking.serviceName} — ${when}`,
    heading: "Your session is confirmed.",
    bodyHtml: `<p><strong>${escapeHtml(booking.serviceName)}</strong><br>
      ${escapeHtml(when)} <span style="color:${DIM};">(${escapeHtml(tz)})</span><br>
      Ref: <strong>${escapeHtml(booking.refCode)}</strong></p>
      <p>${booking.meetingUrl ? `Meeting link: <a href="${booking.meetingUrl}" style="color:${GOLD};">${escapeHtml(booking.meetingUrl)}</a>` : "You'll receive the meeting link before the session."}</p>
      <p>Need to cancel? Use the link on your booking page — cancellations ${escapeHtml("≥")}24h out are refunded in full.</p>`,
    bodyText: `${booking.serviceName}\n${when} (${tz})\nRef: ${booking.refCode}\n${booking.meetingUrl ? `Meeting link: ${booking.meetingUrl}` : "You'll receive the meeting link before the session."}`,
    cta: { label: "Add to calendar", url: `${site}/api/booking/ics/${booking.icsToken}` },
    accent: GREEN,
  }, { kind: "booking-confirm", note: booking.refCode });
}

export function sendBookingNotification(env, booking) {
  const when = bookingWhen(booking, "America/Los_Angeles");
  return send(env, env.ADMIN_EMAIL, {
    subject: `New booking: ${booking.serviceName} — ${when}`,
    heading: "New paid booking",
    bodyHtml: `<p><strong>${escapeHtml(booking.serviceName)}</strong><br>
      ${escapeHtml(when)} (PT)<br>
      ${escapeHtml(booking.buyerName || "")} &lt;${escapeHtml(booking.buyerEmail || "")}&gt;<br>
      Ref: ${escapeHtml(booking.refCode)}${booking.note ? `<br>Note: ${escapeHtml(booking.note)}` : ""}</p>`,
    bodyText: `${booking.serviceName}\n${when} (PT)\n${booking.buyerName || ""} <${booking.buyerEmail || ""}>\nRef: ${booking.refCode}${booking.note ? `\nNote: ${booking.note}` : ""}`,
  }, { kind: "booking-notify", note: booking.refCode });
}

export function sendBookingCancelled(env, booking, { refunded } = {}) {
  const tz = booking.buyerTz || "America/Los_Angeles";
  const when = bookingWhen(booking, tz);
  return send(env, booking.buyerEmail, {
    subject: `Cancelled: ${booking.serviceName} — ${when}`,
    heading: "Booking cancelled",
    bodyHtml: `<p><strong>${escapeHtml(booking.serviceName)}</strong> on ${escapeHtml(when)} is cancelled.</p>
      <p>${refunded ? "Your payment has been refunded in full — allow a few business days for it to land." : "If a refund applies, it will be handled separately."}</p>`,
    bodyText: `${booking.serviceName} on ${when} is cancelled. ${refunded ? "Your payment has been refunded in full." : "If a refund applies, it will be handled separately."}`,
  }, { kind: "booking-cancel", note: booking.refCode });
}

export function sendBookingReminder(env, booking) {
  const tz = booking.buyerTz || "America/Los_Angeles";
  const when = bookingWhen(booking, tz);
  return send(env, booking.buyerEmail, {
    subject: `Reminder: ${booking.serviceName} — ${when}`,
    heading: "See you soon.",
    bodyHtml: `<p><strong>${escapeHtml(booking.serviceName)}</strong><br>${escapeHtml(when)} <span style="color:${DIM};">(${escapeHtml(tz)})</span></p>
      <p>${booking.meetingUrl ? `Meeting link: <a href="${booking.meetingUrl}" style="color:${GOLD};">${escapeHtml(booking.meetingUrl)}</a>` : "The meeting link will arrive before the session."}</p>`,
    bodyText: `${booking.serviceName}\n${when} (${tz})\n${booking.meetingUrl ? `Meeting link: ${booking.meetingUrl}` : ""}`,
    accent: GREEN,
  }, { kind: "booking-reminder", note: booking.refCode });
}

// ── Membership templates ────────────────────────────────────────────────────

export const sendMembershipApplied = (env, user) =>
  send(env, user.email, {
    subject: "Membership application received — Bank of Sol",
    heading: "Application received.",
    bodyHtml: `<p>Thanks, ${escapeHtml(firstName(user))} — your membership application is in the queue. Every member is reviewed and approved personally by Sol; you'll hear back at this address.</p>`,
    bodyText: "Your membership application is in the queue. Every member is reviewed and approved personally by Sol; you'll hear back at this address.",
  }, { kind: "membership-applied" });

export function sendMembershipDecision(env, user, status) {
  const approved = status === "approved";
  return send(env, user.email, {
    subject: approved
      ? "Welcome to Bank of Sol — you're a member"
      : "Your membership application — Bank of Sol",
    heading: approved ? "You're in." : "About your application",
    bodyHtml: approved
      ? `<p>Sol approved your membership. Your account is open — book time, follow your engagements, and see every bill and payment itemized on your account page.</p>`
      : `<p>Your membership application wasn't approved this time. You can reply to this email if you'd like to talk it through.</p>`,
    bodyText: approved
      ? "Sol approved your membership. Your account is open — book time, follow your engagements, and see every bill and payment itemized on your account page."
      : "Your membership application wasn't approved this time. Reply to this email if you'd like to talk it through.",
    ...(approved
      ? { cta: { label: "Open your account", url: `${env.BETTER_AUTH_URL || "https://bankofsol.app"}/billing` }, accent: GREEN }
      : {}),
  }, { kind: "membership-decision", note: status });
}

// ── Billing templates ───────────────────────────────────────────────────────

const usd = (cents) => `$${(Math.trunc(cents) / 100).toFixed(2)}`;

export function sendInvoiceOpened(env, member, invoice) {
  const site = env.SITE_URL || env.BETTER_AUTH_URL || "https://bankofsol.app";
  return send(env, member.email, {
    subject: `Invoice ${invoice.refCode}: ${invoice.title} — ${usd(invoice.totalCents)}`,
    heading: "You have a new invoice.",
    bodyHtml: `<p><strong>${escapeHtml(invoice.title)}</strong><br>
      ${escapeHtml(invoice.refCode)} · <strong>${usd(invoice.totalCents)}</strong>${invoice.dueDate ? ` · due ${escapeHtml(invoice.dueDate)}` : ""}</p>
      <p>Pay by card or crypto from your account page — every line item is listed there.</p>`,
    bodyText: `${invoice.title}\n${invoice.refCode} · ${usd(invoice.totalCents)}${invoice.dueDate ? ` · due ${invoice.dueDate}` : ""}\nPay by card or crypto from your account page.`,
    cta: { label: "View & pay", url: `${site}/billing` },
  }, { kind: "invoice-open", note: invoice.refCode });
}

export function sendPaymentReceived(env, member, invoice, amountCents, status) {
  return send(env, member.email, {
    subject: `Payment received — ${invoice.refCode} ${status === "paid" ? "is paid in full" : `(${usd(amountCents)})`}`,
    heading: status === "paid" ? "Paid in full. Thank you." : "Payment received.",
    bodyHtml: `<p><strong>${usd(amountCents)}</strong> received on <strong>${escapeHtml(invoice.refCode)}</strong> — ${escapeHtml(invoice.title)}.</p>
      ${status === "paid" ? "<p>This invoice is settled.</p>" : `<p>Remaining balance shows on your account page.</p>`}`,
    bodyText: `${usd(amountCents)} received on ${invoice.refCode} — ${invoice.title}. ${status === "paid" ? "This invoice is settled." : "Remaining balance shows on your account page."}`,
    accent: GREEN,
  }, { kind: "payment-received", note: invoice.refCode });
}

export function sendClaimNotice(env, claim, invoice, member) {
  return send(env, env.ADMIN_EMAIL, {
    subject: `Crypto payment claim: ${invoice.refCode} via ${claim.chain}`,
    heading: "A member says they paid.",
    bodyHtml: `<p><strong>${escapeHtml(member.name || member.email)}</strong> claims a <strong>${claim.chain}</strong> payment on <strong>${escapeHtml(invoice.refCode)}</strong> (${escapeHtml(invoice.title)}, ${usd(invoice.totalCents - invoice.paidCents)} outstanding).</p>
      ${claim.txRef ? `<p>Reference: <span style="word-break:break-all;">${escapeHtml(claim.txRef)}</span></p>` : ""}
      <p>Verify it on-chain, then confirm or reject from Admin → Members.</p>`,
    bodyText: `${member.name || member.email} claims a ${claim.chain} payment on ${invoice.refCode} (${usd(invoice.totalCents - invoice.paidCents)} outstanding).${claim.txRef ? `\nReference: ${claim.txRef}` : ""}\nVerify on-chain, then confirm or reject from Admin → Members.`,
  }, { kind: "claim-notice", note: invoice.refCode });
}

export function sendLoanDueNotice(env, member, loan) {
  return send(env, member.email, {
    subject: `Monthly loan payment due — ${loan.refCode}`,
    heading: "Loan payment due.",
    bodyHtml: `<p>Your monthly payment${loan.monthlyDueCents ? ` of <strong>${usd(loan.monthlyDueCents)}</strong>` : ""} on loan <strong>${escapeHtml(loan.refCode)}</strong> is due. Your running balance is itemized on your account page.</p>`,
    bodyText: `Your monthly payment${loan.monthlyDueCents ? ` of ${usd(loan.monthlyDueCents)}` : ""} on loan ${loan.refCode} is due. Your running balance is itemized on your account page.`,
    cta: { label: "Open your account", url: `${env.SITE_URL || env.BETTER_AUTH_URL || "https://bankofsol.app"}/billing` },
  }, { kind: "loan-due", note: loan.refCode });
}

// ── Shop / admin notices ────────────────────────────────────────────────────

export function sendOrderPaidNotification(env, order) {
  return send(env, env.ADMIN_EMAIL, {
    subject: `Order paid: ${order.productName} ×${order.qty} (${order.refCode})`,
    heading: "New paid order",
    bodyHtml: `<p><strong>${escapeHtml(order.productName)}</strong> ×${order.qty}${order.colorName ? ` — ${escapeHtml(order.colorName)}` : ""}<br>
      ${escapeHtml(order.buyerName || "")} &lt;${escapeHtml(order.buyerEmail || "")}&gt;<br>
      Ref: ${escapeHtml(order.refCode)} · $${(order.amountCents / 100).toFixed(2)}</p>`,
    bodyText: `${order.productName} ×${order.qty}${order.colorName ? ` — ${order.colorName}` : ""}\n${order.buyerName || ""} <${order.buyerEmail || ""}>\nRef: ${order.refCode} · $${(order.amountCents / 100).toFixed(2)}`,
  }, { kind: "order-notify", note: order.refCode });
}

// Generic operational notice to Sol (digest, fulfillment errors, discrepancy
// flags). `lines` is plain text, one item per line.
export function sendAdminNotice(env, subject, lines, kind = "admin-notice") {
  const bodyText = Array.isArray(lines) ? lines.join("\n") : String(lines || "");
  return send(env, env.ADMIN_EMAIL, {
    subject,
    heading: subject,
    bodyHtml: `<p>${bodyText.split("\n").map(escapeHtml).join("<br>")}</p>`,
    bodyText,
  }, { kind });
}

// ── Sol & Ray (pilot requests from the landing page) ────────────────────────
// Same shell, Sol & Ray header. The sender is still sol@bankofsol.app and the
// footer still carries the disclosure + not-a-bank line (rule 2).

const SOLRAY = { brand: "SOL & RAY", site: "https://solandray.com", siteLabel: "solandray.com" };

export const sendSolrayLeadReceived = (env, lead) =>
  send(env, lead.email, {
    ...SOLRAY,
    subject: "We got your pilot request — Sol & Ray",
    heading: `Thanks, ${escapeHtml(firstName({ name: lead.name }))}.`,
    bodyHtml: `<p>Your pilot request for <strong>${escapeHtml(lead.org)}</strong> is in. Isaak will reply personally within two business days with a short call time and the security one-pager.</p><p>Nothing is scheduled or committed yet — this is a conversation first.</p>`,
    bodyText: `Your pilot request for ${lead.org} is in. Isaak will reply personally within two business days with a short call time and the security one-pager.\n\nNothing is scheduled or committed yet — this is a conversation first.`,
  }, { kind: "solray-lead-received" });

// Notice to the founder inbox. SOLRAY_NOTIFY_EMAIL (wrangler.jsonc vars)
// overrides ADMIN_EMAIL so Sol & Ray leads reach the address Sol asked for.
export function sendSolrayLeadNotice(env, lead) {
  const to = env.SOLRAY_NOTIFY_EMAIL || env.ADMIN_EMAIL;
  const lines = [
    `Name: ${lead.name}${lead.title ? ` (${lead.title})` : ""}`,
    `Organization: ${lead.org}`,
    `Email: ${lead.email}`,
    `Phone: ${lead.phone || "—"}`,
    `Volume: ${lead.volume || "—"}`,
    `From: ${lead.source || "—"}`,
    "",
    lead.message || "(no message)",
  ];
  const bodyText = lines.join("\n");
  return send(env, to, {
    ...SOLRAY,
    subject: `Pilot request: ${lead.org} — Sol & Ray`,
    heading: `New pilot request from ${lead.org}`,
    bodyHtml: `<p>${lines.map(escapeHtml).join("<br>")}</p>`,
    bodyText,
    cta: { label: "Open the lead queue", url: "https://bankofsol.app/admin" },
  }, { kind: "solray-lead-notice" });
}

// ── Reimbursements ──────────────────────────────────────────────────────────
// Receipts → request → approve → payout. Sol gets the submission notice;
// the member gets the decision and the payout confirmation.

const PAYOUT_LABEL = { stripe: "Stripe (card/bank)", crypto: "crypto", telegram: "Telegram Wallet", cash: "cash" };

export function sendReimbursementSubmitted(env, reimb, member, receiptCount) {
  const site = env.SITE_URL || env.BETTER_AUTH_URL || "https://bankofsol.app";
  const lines = [
    `${member.name || member.email} filed ${reimb.refCode}: ${reimb.title}`,
    `Total: ${usd(reimb.totalCents)} across ${receiptCount} receipt${receiptCount === 1 ? "" : "s"}`,
    `Payout: ${PAYOUT_LABEL[reimb.method] || reimb.method}`,
    reimb.note ? `Note: ${reimb.note}` : "",
  ].filter(Boolean);
  return send(env, env.ADMIN_EMAIL, {
    subject: `Reimbursement request ${reimb.refCode} — ${usd(reimb.totalCents)}`,
    heading: "A reimbursement needs your approval.",
    bodyHtml: `<p>${lines.map(escapeHtml).join("<br>")}</p><p>Approve, reject, or pay it from Admin → Reimbursements.</p>`,
    bodyText: `${lines.join("\n")}\nApprove, reject, or pay it from Admin → Reimbursements.`,
    cta: { label: "Review the request", url: `${site}/admin` },
  }, { kind: "reimbursement-submitted", note: reimb.refCode });
}

export function sendReimbursementDecision(env, member, reimb, status) {
  const site = env.SITE_URL || env.BETTER_AUTH_URL || "https://bankofsol.app";
  const approved = status === "approved";
  return send(env, member.email, {
    subject: approved
      ? `Approved: ${reimb.refCode} — ${usd(reimb.totalCents)}`
      : `About ${reimb.refCode} — Bank of Sol`,
    heading: approved ? "Approved — payout is next." : "About your reimbursement request",
    bodyHtml: approved
      ? `<p><strong>${escapeHtml(reimb.title)}</strong> (${escapeHtml(reimb.refCode)}) is approved for <strong>${usd(reimb.totalCents)}</strong>. It's on your ledger now and will be paid out by ${escapeHtml(PAYOUT_LABEL[reimb.method] || reimb.method)}; you'll get another email when it's sent.</p>${reimb.adminNote ? `<p style="color:${DIM};">Note from Sol: ${escapeHtml(reimb.adminNote)}</p>` : ""}`
      : `<p><strong>${escapeHtml(reimb.title)}</strong> (${escapeHtml(reimb.refCode)}) wasn't approved.</p>${reimb.adminNote ? `<p>Note from Sol: ${escapeHtml(reimb.adminNote)}</p>` : ""}<p>Reply to this email if you'd like to talk it through.</p>`,
    bodyText: approved
      ? `${reimb.title} (${reimb.refCode}) is approved for ${usd(reimb.totalCents)}. It's on your ledger and will be paid out by ${PAYOUT_LABEL[reimb.method] || reimb.method}.${reimb.adminNote ? `\nNote from Sol: ${reimb.adminNote}` : ""}`
      : `${reimb.title} (${reimb.refCode}) wasn't approved.${reimb.adminNote ? `\nNote from Sol: ${reimb.adminNote}` : ""}\nReply to this email if you'd like to talk it through.`,
    ...(approved ? { accent: GREEN, cta: { label: "See your account", url: `${site}/reimbursements` } } : {}),
  }, { kind: "reimbursement-decision", note: `${reimb.refCode} ${status}` });
}

export function sendReimbursementPaid(env, member, reimb) {
  const site = env.SITE_URL || env.BETTER_AUTH_URL || "https://bankofsol.app";
  const how = PAYOUT_LABEL[reimb.paidMethod] || reimb.paidMethod || "";
  return send(env, member.email, {
    subject: `Paid: ${reimb.refCode} — ${usd(reimb.totalCents)}`,
    heading: "Sent. Thank you.",
    bodyHtml: `<p><strong>${usd(reimb.totalCents)}</strong> for <strong>${escapeHtml(reimb.title)}</strong> (${escapeHtml(reimb.refCode)}) was paid out by ${escapeHtml(how)}.</p>${reimb.paidRef ? `<p style="color:${DIM};word-break:break-all;">Reference: ${escapeHtml(reimb.paidRef)}</p>` : ""}`,
    bodyText: `${usd(reimb.totalCents)} for ${reimb.title} (${reimb.refCode}) was paid out by ${how}.${reimb.paidRef ? `\nReference: ${reimb.paidRef}` : ""}`,
    accent: GREEN,
    cta: { label: "See your ledger", url: `${site}/billing` },
  }, { kind: "reimbursement-paid", note: reimb.refCode });
}

// ── Waitlist ────────────────────────────────────────────────────────────────

export const sendWaitlistReceived = (env, person) =>
  send(env, person.email, {
    subject: "You're on the Bank of Sol waitlist",
    heading: `Thanks, ${escapeHtml(firstName(person))}.`,
    bodyHtml: `<p>You're on the list. Bank of Sol is members-only and by invitation; Sol reviews the waitlist personally and will reach out at this address.</p>`,
    bodyText: "You're on the list. Bank of Sol is members-only and by invitation; Sol reviews the waitlist personally and will reach out at this address.",
  }, { kind: "waitlist-received" });
