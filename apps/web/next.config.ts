import type { NextConfig } from "next";

// Proxies /api/v1/* to apps/api so the browser sees one origin and
// SameSite=Lax cookies work end to end, even across different registrable
// domains in production (architecture §14, TASK-auth-tenancy §7). Reads
// API_URL server-side only — never NEXT_PUBLIC_ — so the API's real origin
// never reaches the client.
//
// rewrites() is baked into `.next/routes-manifest.json` at `next build` and
// is NOT re-invoked by `next start` (TASK-railway-deploy §6.2), so API_URL
// must be present at build time. apps/web/Dockerfile takes it as a build
// arg (TASK-aws-deploy §2.4); a missing value fails the build instead of
// shipping a manifest with no rewrite.
const nextConfig: NextConfig = {
  async rewrites() {
    const apiUrl = process.env.API_URL;
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
};

export default nextConfig;
