import { Link, NavLink } from "react-router-dom";
import { useMe } from "../lib/me-context.jsx";
import { useSession } from "../lib/auth-client.js";

// The public site has no navigation: just the brand. Signed-in members get
// their account link; admins get Admin. The login button lives on the
// homepage (and, quietly, as the sun in the footer).
export default function Nav() {
  const { data } = useSession();
  const { me } = useMe();

  return (
    <header className="nav">
      <div className="nav-inner">
        <Link className="nav-brand" to="/">
          BANK OF SOL
        </Link>
        <nav className="nav-links" aria-label="Main">
          {data?.user && (
            <NavLink to="/reimbursements" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
              Receipts
            </NavLink>
          )}
          {data?.user && (
            <NavLink to="/billing" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
              Ledger
            </NavLink>
          )}
          {me?.isAdmin && (
            <NavLink to="/admin" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
              Admin
            </NavLink>
          )}
        </nav>
        <div className="nav-auth">
          {data?.user && (
            <NavLink to="/dashboard" className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}>
              <span className="nav-user">{me?.name || data.user.name || "Account"}</span>
            </NavLink>
          )}
        </div>
      </div>
    </header>
  );
}
