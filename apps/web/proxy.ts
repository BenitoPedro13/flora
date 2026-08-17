import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Next's proxy matcher (below) excludes _next/static, _next/image, and
// favicon.ico, but not the rest of public/ — /landing's marketing-page
// assets are served through here too and need the same public exception.
const PUBLIC_PATHS = ["/login", "/landing"];

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
  if (pathname === "/" || PUBLIC_PATHS.some((path) => pathname.startsWith(path))) {
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
