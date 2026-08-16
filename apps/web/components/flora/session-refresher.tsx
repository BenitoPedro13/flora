"use client";

import * as React from "react";

/** Comfortably under `ACCESS_TOKEN_TTL_SECONDS`'s 900s default (15 min) — refresh well before expiry, not right at it. */
const REFRESH_INTERVAL_MS = 10 * 60 * 1000;

function refresh() {
  void fetch("/api/v1/auth/refresh", { method: "POST", credentials: "same-origin" });
}

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
 *
 * **Second bug found live, same day:** the interval alone still forced a
 * login "from time to time" — its first tick doesn't fire until 10 minutes
 * after mount, so any gap longer than the access token's 15-minute TTL
 * between mounts (a closed tab, a sleeping laptop, or a background tab's
 * timers throttled by the browser) leaves the token already expired before
 * the interval gets a chance to renew it. Refreshing once immediately on
 * mount closes that gap — a stale refresh token still fails safely (a normal
 * 401 → login redirect), it just no longer fails for a reason this
 * component could have prevented.
 */
export function SessionRefresher() {
  React.useEffect(() => {
    refresh();
    const id = setInterval(refresh, REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  return null;
}
