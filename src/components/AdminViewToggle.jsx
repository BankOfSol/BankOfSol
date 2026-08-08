import { useSearchParams } from "react-router-dom";
import { useMe } from "../lib/me-context.jsx";

// Admin tools live on the page they manage, not on a separate /admin tab: an
// admin opening /shop flips this switch to manage the store in place. The
// shop is the first consumer; any page can adopt it in three lines.
//
// The chosen view lives in ?view= so a manage view is bookmarkable and survives
// a reload. This is presentation only — every /api/admin/* route still enforces
// requireAdmin, so a non-admin typing ?view=manage gets nothing.

export function useAdminView(adminKey = "manage") {
  const [params, setParams] = useSearchParams();
  const { me } = useMe();
  const isAdmin = !!me?.isAdmin;
  const view = isAdmin && params.get("view") === adminKey ? adminKey : "public";

  const setView = (next) => {
    const p = new URLSearchParams(params);
    if (next === adminKey) p.set("view", adminKey);
    else p.delete("view");
    setParams(p, { replace: true });
  };

  return { isAdmin, view, isManaging: view === adminKey, setView, adminKey };
}

export default function AdminViewToggle({
  labels = ["Store", "Manage"],
  badge = 0,
  adminKey = "manage",
}) {
  const { isAdmin, view, setView } = useAdminView(adminKey);
  if (!isAdmin) return null;

  const options = [
    ["public", labels[0]],
    [adminKey, labels[1]],
  ];

  return (
    <div className="view-toggle" role="group" aria-label="View">
      {options.map(([key, label]) => (
        <button
          key={key}
          type="button"
          className={view === key ? "active" : ""}
          aria-pressed={view === key}
          onClick={() => setView(key)}
        >
          {label}
          {key === adminKey && badge > 0 && <span className="tab-badge">{badge}</span>}
        </button>
      ))}
    </div>
  );
}
