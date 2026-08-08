import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { signUp } from "../lib/auth-client.js";
import usePageMeta from "../lib/usePageMeta.js";

// Where to land after the verification link is clicked. `?next=` lets a funnel
// hand the new user straight to what they came for (/custody sends them back
// to the vault teaser). Same-origin paths only — never bounce to a foreign host.
function safeNext(raw) {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/dashboard";
  return raw;
}

// Copy tweaks per funnel, so the page speaks to why they clicked.
const NEXT_COPY = {
  "/custody": {
    heading: "Start your vault application",
    sub: "Create your account first — then your custody application goes straight to Sol for personal review.",
  },
  "/book": {
    heading: "Book time with Sol",
    sub: "Create your account first — then pick a slot and you're booked once payment clears.",
  },
};

export default function Signup() {
  usePageMeta({ title: "Open Account" });
  const [params] = useSearchParams();
  const next = safeNext(params.get("next"));
  const copy = NEXT_COPY[next];
  const loginState = params.get("next") ? { from: next } : undefined;
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    if (password.length < 8) {
      setErr("Password must be at least 8 characters.");
      return;
    }
    setBusy(true);
    // callbackURL rides along in the verification link — after the user clicks
    // it, Better Auth verifies, auto-signs them in, and redirects here, so a
    // freshly confirmed user lands where their funnel started.
    const { error } = await signUp.email({
      email,
      password,
      name,
      callbackURL: next,
    });
    setBusy(false);
    if (error) {
      setErr(error.message || "Could not create your account.");
      return;
    }
    // Email verification is a hard gate — signup does NOT sign you in. A
    // confirmation link is in the mail; the account is dormant until clicked.
    setSent(true);
  }

  if (sent) {
    return (
      <div className="page">
        <div className="panel narrow">
          <h1>Check your email</h1>
          <p className="muted">
            We sent a confirmation link to <strong className="gold">{email}</strong>.
            Click it to activate your account — the link works for 24 hours.
          </p>
          <p className="muted">
            You'll be able to log in once your email is confirmed. Don't see
            it? Check spam, or just try logging in and we'll send a fresh link.
          </p>
          {copy && (
            <p className="muted">Once you confirm, we'll drop you right back where you left off.</p>
          )}
          <p className="panel-switch">
            <Link to="/login" state={loginState}>
              Go to log in →
            </Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="panel narrow">
        <h1>{copy?.heading || "Open your account"}</h1>
        <p className="muted">
          {copy?.sub ||
            "One account for custody applications, consulting bookings, and your orders."}
        </p>
        <form onSubmit={onSubmit}>
          <div className="form-field">
            <label htmlFor="name">
              Name <span className="req">*</span>
            </label>
            <input
              id="name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
            />
          </div>
          <div className="form-field">
            <label htmlFor="email">
              Email <span className="req">*</span>
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@email.com"
            />
            <span className="hint">We'll send a link to confirm this address.</span>
          </div>
          <div className="form-field">
            <label htmlFor="password">
              Password <span className="req">*</span>
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
            />
          </div>
          {err && <div className="form-result error">{err}</div>}
          <button className="btn btn-gold btn-block" disabled={busy}>
            {busy ? "Creating…" : "Open account"}
          </button>
        </form>
        <p className="panel-switch">
          Already have an account?{" "}
          <Link to="/login" state={loginState}>
            Log in →
          </Link>
        </p>
      </div>
    </div>
  );
}
