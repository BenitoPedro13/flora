import type { NextConfig } from "next";
import { PHASE_PRODUCTION_BUILD } from "next/constants";

// Proxies /api/v1/* to apps/api so the browser sees one origin and
// SameSite=Lax cookies work end to end, even across different registrable
// domains in production (architecture §14, TASK-auth-tenancy §7). Reads
// API_URL server-side only — never NEXT_PUBLIC_ — so the API's real origin
// never reaches the client.
//
// Exported as a function of `phase`, not a plain object: Railway's Railpack
// build sandbox doesn't expose service env vars to the build command
// (confirmed empirically, TASK-railway-deploy — `railway variable list`
// shows API_URL resolved correctly, but `next build` still sees it unset).
// rewrites() is baked into `.next/routes-manifest.json` at build time and
// is NOT re-invoked by `next start` (verified: a build-time empty array
// shipped a manifest with no /api/v1/* rewrite at all, 404ing every
// request even though the runtime env var was present) — so the
// PHASE_PRODUCTION_BUILD branch needs a *working* URL, not a placeholder.
// Railway's private-network hostname is deterministic
// (`<service>.railway.internal`), so it's a safe build-time default; the
// real env var still wins whenever the platform does expose it (local dev
// via .env, most other hosts) since this only applies when API_URL is unset.
const nextConfig = (phase: string): NextConfig => ({
  async rewrites() {
    const apiUrl =
      process.env.API_URL ??
      (phase === PHASE_PRODUCTION_BUILD ? "http://api.railway.internal:3001" : undefined);
    if (!apiUrl) {
      throw new Error("API_URL is not set");
    }
    return [
      {
        source: "/api/v1/:path*",
        destination: `${apiUrl}/api/v1/:path*`,
      },
    ];
  },
});

export default nextConfig;
