import { useMe } from "../lib/me-context.jsx";

// Shown to signed-in-but-unverified users. With the hard verification gate
// this state is rare (login is blocked until verified), but a session created
// right after clicking the link can briefly lag — keep the banner harmless.
export default function VerifyBanner() {
  const { me } = useMe();
  if (!me || me.emailVerified) return null;
  return (
    <div className="form-result error" role="alert">
      Your email isn't verified yet — check your inbox for the confirmation
      link before applying for custody or booking time.
    </div>
  );
}
