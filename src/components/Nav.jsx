import { Link, NavLink } from "react-router-dom";
import { useMe } from "../lib/me-context.jsx";
import { useSession } from "../lib/auth-client.js";
import { isShopHost, mainSiteUrl } from "../lib/host.js";

// On the shop subdomain, bank pages live on the apex — plain <a> cross-host.
// Everywhere else these are client-side <NavLink>s.
function SiteLink({ to, children, end }) {
  if (isShopHost()) {
    return (
      <a className="nav-link" href={mainSiteUrl(to)}>
        {children}
      </a>
    );
  }
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
    >
      {children}
    </NavLink>
  );
}

export default function Nav() {
  const { data } = useSession();
  const { me } = useMe();

  // The shop host is a STANDALONE storefront: its own brand, a quiet link
  // back to the main site, and nothing else pulling attention away from the
  // goods. (Admins still get their manage entry point.)
  if (isShopHost()) {
    return (
      <header className="nav">
        <div className="nav-inner">
          <a className="nav-brand" href="/">
            BANK OF SOL <span className="nav-brand-sub">SHOP</span>
          </a>
          <nav className="nav-links" aria-label="Main" />
          <div className="nav-auth">
            {me?.isAdmin && (
              <a className="nav-link" href="/?view=manage">
                Manage
              </a>
            )}
            <a className="nav-link" href={mainSiteUrl("/")}>
              bankofsol.app →
            </a>
          </div>
        </div>
      </header>
    );
  }

  return (
    <header className="nav">
      <div className="nav-inner">
        <Link className="nav-brand" to="/">
          BANK OF SOL
        </Link>
        <nav className="nav-links" aria-label="Main">
          <SiteLink to="/membership">Membership</SiteLink>
          <SiteLink to="/consulting">Consulting</SiteLink>
          <SiteLink to="/book">Book time</SiteLink>
          {me?.isAdmin && <SiteLink to="/admin">Admin</SiteLink>}
        </nav>
        <div className="nav-auth">
          {data?.user ? (
            <SiteLink to="/dashboard">
              <span className="nav-user">{me?.name || data.user.name || "Account"}</span>
            </SiteLink>
          ) : (
            <>
              <SiteLink to="/login">Log in</SiteLink>
              <SiteLink to="/signup">
                <span className="btn btn-gold btn-sm">Open account</span>
              </SiteLink>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
