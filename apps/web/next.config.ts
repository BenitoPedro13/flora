import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Proxies /api/v1/* to apps/api so the browser sees one origin and
  // SameSite=Lax cookies work end to end, even though apps/web (Vercel) and
  // apps/api (Railway/Fly) are different registrable domains in production
  // (architecture §14, TASK-auth-tenancy §7). Reads API_URL server-side only
  // — never NEXT_PUBLIC_ — so the API's real origin never reaches the client.
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
