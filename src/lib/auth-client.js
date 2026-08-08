import { createAuthClient } from "better-auth/react";

// baseURL defaults to the current origin, so the client talks to /api/auth/*
// on whichever host we're served from (apex, www, shop). Same-origin plus the
// production cross-subdomain cookie => one login works everywhere.
export const authClient = createAuthClient();

export const { useSession, signIn, signUp, signOut } = authClient;
