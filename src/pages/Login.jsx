import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { signIn } from "../lib/auth-client.js";
import { afterLogin } from "../lib/afterLogin.js";
import usePageMeta from "../lib/usePageMeta.js";

export default function Login() {
  usePageMeta({ title: "Log In" });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const location = useLocation();
  const from = location.state?.from;

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    const { error } = await signIn.email({ email, password });
    setBusy(false);
    if (error) {
      // Hard email gate: an unverified account can't sign in. Better Auth has
      // already re-sent a fresh confirmation link (emailVerification.sendOnSignIn),
      // so point the user at their inbox rather than showing a generic failure.
      setErr(
        error.code === "EMAIL_NOT_VERIFIED"
          ? "Confirm your email first — we just sent a fresh link to your inbox. Click it, then log in."
          : error.message || "Could not sign in. Check your details."
      );
      return;
    }
    await afterLogin(from);
  }

  return (
    <div className="page">
      <div className="panel narrow">
        <h1>Log in</h1>
        <p className="muted">Welcome back to the vault.</p>
        <form onSubmit={onSubmit}>
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
              placeholder="Your password"
            />
          </div>
          {err && <div className="form-result error">{err}</div>}
          <button className="btn btn-gold btn-block" disabled={busy}>
            {busy ? "Logging in…" : "Log in"}
          </button>
        </form>
        <p className="panel-switch">
          <Link to="/forgot-password">Forgot your password?</Link>
        </p>
        <p className="panel-switch">
          New here? <Link to="/signup">Open an account →</Link>
        </p>
      </div>
    </div>
  );
}
