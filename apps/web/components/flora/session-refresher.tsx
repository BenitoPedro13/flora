"use client";

import * as React from "react";

/** Comfortably under `ACCESS_TOKEN_TTL_SECONDS`'s 900s default (15 min) — refresh well before expiry, not right at it. */
const REFRESH_INTERVAL_MS = 10 * 60 * 1000;

/**
 * Silently renews the session in the background. `POST /api/v1/auth/refresh`
 * has existed on the API since TASK-auth-tenancy, but nothing in `apps/web`
 * ever called it (found live, 2026-08-16) — so every session died with the
 * access token's own 15-minute TTL regardless of the refresh token's real
 * 30-day one, forcing a login every ~15 minutes of active use.
 *
 * The refresh cookie is deliberately scoped to `path: '/api/v1/auth/refresh'`
 * (`apps/api/src/auth/cookies.ts`) — the browser only attaches it to a
 * request whose URL matches that path, never to an ordinary page
 * navigation. That rules out fixing this in `proxy.ts` (it only ever sees
 * whatever cookies the browser chose to send with the *current* request) and
 * is exactly why this has to be a same-origin client fetch to that literal
 * path, run periodically while a tab is open, rather than a one-shot check
 * on load.
 */
export function SessionRefresher() {
  React.useEffect(() => {
    const id = setInterval(() => {
      void fetch("/api/v1/auth/refresh", { method: "POST", credentials: "same-origin" });
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  return null;
}
