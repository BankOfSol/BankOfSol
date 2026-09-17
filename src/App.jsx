import { useEffect } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useSession } from "./lib/auth-client.js";
import { isShopHost } from "./lib/host.js";
import Nav from "./components/Nav.jsx";
import Footer from "./components/Footer.jsx";
import Home from "./pages/Home.jsx";
import Membership from "./pages/Membership.jsx";
import Billing from "./pages/Billing.jsx";
import Reimbursements from "./pages/Reimbursements.jsx";
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

// The public site is the homepage (sun + waitlist + login), the auth pages,
// and the legal pages. Everything else is behind the login.
function Protected({ children }) {
  const { data, isPending } = useSession();
  const location = useLocation();
  if (isPending) return <div className="spinner">Loading…</div>;
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

// shop.bankofsol.app no longer serves anything — hop to the apex.
function ApexRedirect() {
  useEffect(() => {
    const apex = window.location.hostname.replace(/^shop\./, "");
    window.location.replace(`${window.location.protocol}//${apex}/`);
  }, []);
  return <div className="spinner">Taking you to bankofsol.app…</div>;
}

export default function App() {
  if (isShopHost()) return <ApexRedirect />;

  return (
    <>
      <Nav />
      <Routes>
        <Route path="/" element={<Home />} />
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
          path="/membership"
          element={
            <Protected>
              <Membership />
            </Protected>
          }
        />
        <Route
          path="/billing"
          element={
            <Protected>
              <Billing />
            </Protected>
          }
        />
        <Route
          path="/reimbursements"
          element={
            <Protected>
              <Reimbursements />
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
