import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Next's proxy matcher (below) excludes _next/static, _next/image, and
// favicon.ico, but not the rest of public/ — /landing's marketing-page
// assets are served through here too and need the same public exception.
const PUBLIC_PATHS = ["/login", "/landing"];

// Every route's Next.js file-convention image (opengraph-image.tsx, one per
// route — see `docs/architecture.md`'s SEO metadata task) plus the
// hand-drawn favicon in public/. Social-preview crawlers and logged-out
// browser tabs fetch these with no session cookie; without this exception
// the catch-all check below 307s them to /login instead of the image, so
// every OG card and the tab icon silently rendered the login page.
//
// The real served path isn't a bare "/opengraph-image" — Next appends a
// content-hash suffix to the segment itself (e.g. "/opengraph-image-pwu6ef",
// confirmed against `.next/routes-manifest.json`, not documented). Matching
// only the exact bare path (as an earlier version of this check did) missed
// every real request and left the exact same 307-to-/login bug in place.
const OPENGRAPH_IMAGE_PATH = /\/opengraph-image(-[a-z0-9]+)?$/;
function isPublicAsset(pathname: string): boolean {
  return pathname === "/favicon.svg" || OPENGRAPH_IMAGE_PATH.test(pathname);
}

/**
 * An optimistic check only — cookie *presence*, not validity (Next's own
 * guidance: proxy shouldn't be the full auth solution). The access token's
 * actual verification happens in `getSession()` (lib/session.ts), which is
 * what `app/(app)/layout.tsx` calls before rendering anything under `(app)`.
 *
 * `/` is checked by exact match, not prefix (TASK-landing-page) — it's now
 * the public marketing page, not a route with children, so `startsWith`
 * would wrongly swallow every other path too.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (
    pathname === "/" ||
    PUBLIC_PATHS.some((path) => pathname.startsWith(path)) ||
    isPublicAsset(pathname)
  ) {
    return NextResponse.next();
  }

  const hasSessionCookie = request.cookies.has("flora_access_token");
  if (!hasSessionCookie) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
