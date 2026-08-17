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
// shows API_URL resolved correctly, but `next build` still sees it unset),
// so the PHASE_PRODUCTION_BUILD call below can't see a real value. `next
// start` (not a standalone/exported build) reloads this config and calls
// rewrites() again at actual server boot, where the deploy container's real
// env vars are present — so only the build-phase call gets a placeholder.
const nextConfig = (phase: string): NextConfig => ({
  async rewrites() {
    const apiUrl = process.env.API_URL;
    if (!apiUrl) {
      if (phase === PHASE_PRODUCTION_BUILD) {
        return [];
      }
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
