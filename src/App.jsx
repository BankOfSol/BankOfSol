import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useSession } from "./lib/auth-client.js";
import { isShopHost } from "./lib/host.js";
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
  // the dashboard — keeps the /membership → apply funnel intact for someone who
  // has to log in mid-flow.
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

export default function App() {
  // shop.bankofsol.app serves the same SPA; only the index route differs.
  // Product pages keep the /shop/:id path on every host so links never fork.
  const shopHost = isShopHost();
  return (
    <>
      <Nav />
      <Routes>
        <Route path="/" element={shopHost ? <Shop /> : <Home />} />
        <Route path="/consulting" element={<Consulting />} />
        <Route path="/book" element={<Book />} />
        <Route path="/booking/return" element={<BookingReturn />} />
        {/* Public storefront — buying needs no account (guest checkout);
            admins manage it in place via ?view=manage. */}
        <Route path="/shop" element={<Shop />} />
        <Route path="/shop/:id" element={<ShopProduct />} />
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
