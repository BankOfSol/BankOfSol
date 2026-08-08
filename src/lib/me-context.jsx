import { createContext, useContext, useEffect, useState } from "react";
import { useSession } from "./auth-client.js";
import { api } from "./api.js";

// One shared /api/me fetch per login/logout, so components that need more
// than the raw Better Auth session (admin flags, membership state) don't each
// re-fetch. useSession() stays the source of truth for "signed in at all";
// this context layers the server-computed fields on top.
const MeContext = createContext({
  me: null,
  membership: null,
  refresh: () => {},
});

export function MeProvider({ children }) {
  const { data } = useSession();
  const sessionUserId = data?.user?.id || null;
  const [state, setState] = useState({ me: null, membership: null });

  const refresh = () => {
    if (!sessionUserId) {
      setState({ me: null, membership: null });
      return;
    }
    api
      .me()
      .then((d) => setState({ me: d.user, membership: d.membership || null }))
      .catch(() => setState({ me: null, membership: null }));
  };

  useEffect(refresh, [sessionUserId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <MeContext.Provider value={{ me: state.me, membership: state.membership, refresh }}>
      {children}
    </MeContext.Provider>
  );
}

export const useMe = () => useContext(MeContext);
