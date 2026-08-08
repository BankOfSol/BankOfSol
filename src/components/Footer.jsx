import { isShopHost, mainSiteUrl } from "../lib/host.js";
import { Link } from "react-router-dom";

function FootLink({ to, children }) {
  if (isShopHost())
    return (
      <a className="foot-link" href={mainSiteUrl(to)}>
        {children}
      </a>
    );
  return (
    <Link className="foot-link" to={to}>
      {children}
    </Link>
  );
}

export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer-inner">
        <div className="footer-links">
          <FootLink to="/terms">Terms</FootLink>
          <FootLink to="/privacy">Privacy</FootLink>
          <a className="foot-link" href="mailto:sol@bankofsol.app">
            sol@bankofsol.app
          </a>
        </div>
        <p className="footer-disclaimer">
          Bank of Sol is a technology and services company, not a chartered
          bank or licensed depository institution. Member accounts are service
          ledgers, not deposit accounts, and are not FDIC insured.
        </p>
        <p className="footer-copy">© {new Date().getFullYear()} Bank of Sol</p>
      </div>
    </footer>
  );
}
