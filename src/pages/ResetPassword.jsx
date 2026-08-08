import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { authClient } from "../lib/auth-client.js";
import usePageMeta from "../lib/usePageMeta.js";

// The email links to /reset-password/<token>, which Better Auth validates and
// then redirects here as /reset-password?token=… (or ?error=INVALID_TOKEN).
export default function ResetPassword() {
  usePageMeta({ title: "Reset Password" });
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token");
  const linkError = params.get("error");

  const [pw, setPw] = useState({ next: "", confirm: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  if (linkError || !token) {
    return (
      <div className="page">
        <div className="panel narrow">
          <h1>Link expired</h1>
          <p className="muted">That reset link is no longer valid — they only last an hour.</p>
          <p className="panel-switch">
            <Link to="/forgot-password">Send me a new one →</Link>
          </p>
        </div>
      </div>
    );
  }

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    if (pw.next.length < 8) {
      setErr("Password must be at least 8 characters.");
      return;
    }
    if (pw.next !== pw.confirm) {
      setErr("Passwords don't match.");
      return;
    }
    setBusy(true);
    const { error } = await authClient.resetPassword({ newPassword: pw.next, token });
    setBusy(false);
    if (error) {
      setErr(error.message || "Could not reset your password. The link may have expired.");
      return;
    }
    navigate("/login", { replace: true });
  }

  return (
    <div className="page">
      <div className="panel narrow">
        <h1>New password</h1>
        <p className="muted">Pick something you'll remember.</p>
        <form onSubmit={onSubmit}>
          <div className="form-field">
            <label htmlFor="pw-next">
              New password <span className="req">*</span>
            </label>
            <input
              id="pw-next"
              type="password"
              required
              autoComplete="new-password"
              value={pw.next}
              onChange={(e) => setPw((s) => ({ ...s, next: e.target.value }))}
              placeholder="At least 8 characters"
            />
          </div>
          <div className="form-field">
            <label htmlFor="pw-confirm">
              Confirm password <span className="req">*</span>
            </label>
            <input
              id="pw-confirm"
              type="password"
              required
              autoComplete="new-password"
              value={pw.confirm}
              onChange={(e) => setPw((s) => ({ ...s, confirm: e.target.value }))}
            />
          </div>
          {err && <div className="form-result error">{err}</div>}
          <button className="btn btn-gold btn-block" disabled={busy}>
            {busy ? "Saving…" : "Set password"}
          </button>
        </form>
      </div>
    </div>
  );
}
