import { useEffect } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useSession } from "./lib/auth-client.js";
import { isShopHost, isLocalDev, shopSiteUrl } from "./lib/host.js";
import Nav from "./components/Nav.jsx";
import Footer from "./components/Footer.jsx";
import Home from "./pages/Home.jsx";
import Consulting from "./pages/Consulting.jsx";
import Book from "./pages/Book.jsx";
import BookingReturn from "./pages/BookingReturn.jsx";
import Shop from "./pages/Shop.jsx";
import ShopProduct from "./pages/ShopProduct.jsx";
import Membership from "./pages/Membership.jsx";
import Billing from "./pages/Billing.jsx";
import Login from "./pages/Login.jsx";
import Signup from "./pages/Signup.jsx";
import ForgotPassword from "./pages/ForgotPassword.jsx";
import ResetPassword from "./pages/ResetPassword.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Account from "./pages/Account.jsx";
import Admin from "./pages/Admin.jsx";
import SuperAdmin from "./pages/SuperAdmin.jsx";
import Terms from "./pages/Terms.jsx";
import Privacy from "./pages/Privacy.jsx";

function Protected({ children }) {
  const { data, isPending } = useSession();
  const location = useLocation();
  if (isPending) return <div className="spinner">Loading…</div>;
  // Carry where they were headed so login lands them back there instead of
  // the dashboard — keeps the /membership → apply funnel intact for someone
  // who has to log in mid-flow.
  if (!data?.user)
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location.pathname + location.search }}
      />
    );
  return children;
}

// Full-page hop to the main site, keeping the path — the shop host serves
// ONLY the storefront.
function ApexRedirect() {
  const location = useLocation();
  useEffect(() => {
    const apex = window.location.hostname.replace(/^shop\./, "");
    window.location.replace(
      `${window.location.protocol}//${apex}${location.pathname}${location.search}`
    );
  }, [location]);
  return <div className="spinner">Taking you to bankofsol.app…</div>;
}

// The main site doesn't host the shop (except in local dev, where there are
// no subdomains) — old /shop links forward to the storefront.
function ShopForward({ children }) {
  const location = useLocation();
  const local = isLocalDev();
  useEffect(() => {
    if (!local) {
      const sub = location.pathname.replace(/^\/shop/, "") || "/";
      window.location.replace(shopSiteUrl(sub === "/" ? "/" : `/shop${sub}`));
    }
  }, [local, location]);
  if (local) return children;
  return <div className="spinner">Opening the shop…</div>;
}

export default function App() {
  // shop.bankofsol.app is a standalone storefront: the store at "/", product
  // pages, nothing else — any other path hops back to the apex.
  if (isShopHost()) {
    return (
      <>
        <Nav />
        <Routes>
          <Route path="/" element={<Shop />} />
          <Route path="/shop" element={<Navigate to="/" replace />} />
          <Route path="/shop/:id" element={<ShopProduct />} />
          <Route path="*" element={<ApexRedirect />} />
        </Routes>
        <Footer />
      </>
    );
  }

  return (
    <>
      <Nav />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/consulting" element={<Consulting />} />
        <Route path="/book" element={<Book />} />
        <Route path="/booking/return" element={<BookingReturn />} />
        {/* The storefront lives on shop.bankofsol.app — these forward there
            in production and render inline only in local dev. */}
        <Route
          path="/shop"
          element={
            <ShopForward>
              <Shop />
            </ShopForward>
          }
        />
        <Route
          path="/shop/:id"
          element={
            <ShopForward>
              <ShopProduct />
            </ShopForward>
          }
        />
        <Route path="/membership" element={<Membership />} />
        {/* The pre-pivot URL — keep old links working. */}
        <Route path="/custody" element={<Navigate to="/membership" replace />} />
        <Route
          path="/billing"
          element={
            <Protected>
              <Billing />
            </Protected>
          }
        />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route
          path="/dashboard"
          element={
            <Protected>
              <Dashboard />
            </Protected>
          }
        />
        <Route
          path="/account"
          element={
            <Protected>
              <Account />
            </Protected>
          }
        />
        <Route
          path="/admin"
          element={
            <Protected>
              <Admin />
            </Protected>
          }
        />
        <Route
          path="/superadmin"
          element={
            <Protected>
              <SuperAdmin />
            </Protected>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Footer />
    </>
  );
}
