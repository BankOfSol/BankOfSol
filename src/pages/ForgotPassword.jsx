import { useState } from "react";
import { Link } from "react-router-dom";
import { authClient } from "../lib/auth-client.js";
import usePageMeta from "../lib/usePageMeta.js";

export default function ForgotPassword() {
  usePageMeta({ title: "Reset Password" });
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    const { error } = await authClient.requestPasswordReset({
      email: email.trim(),
      redirectTo: "/reset-password",
    });
    setBusy(false);
    if (error) {
      setErr(error.message || "Could not send the reset link.");
      return;
    }
    // Always the same confirmation, whether or not the account exists —
    // otherwise this page tells strangers which emails are registered.
    setSent(true);
  }

  if (sent) {
    return (
      <div className="page">
        <div className="panel narrow">
          <h1>Check your email</h1>
          <p className="muted">
            If an account exists for <strong className="gold">{email}</strong>, a
            reset link is on its way. It expires in an hour.
          </p>
          <p className="panel-switch">
            <Link to="/login">← Back to log in</Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="panel narrow">
        <h1>Forgot password</h1>
        <p className="muted">Enter your email and we'll send a reset link.</p>
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
          {err && <div className="form-result error">{err}</div>}
          <button className="btn btn-gold btn-block" disabled={busy}>
            {busy ? "Sending…" : "Send reset link"}
          </button>
        </form>
        <p className="panel-switch">
          Remembered it? <Link to="/login">Log in →</Link>
        </p>
      </div>
    </div>
  );
}
