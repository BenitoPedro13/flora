import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login"];

/**
 * An optimistic check only — cookie *presence*, not validity (Next's own
 * guidance: proxy shouldn't be the full auth solution). The access token's
 * actual verification happens in `getSession()` (lib/session.ts), which is
 * what `app/page.tsx` calls before rendering anything.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.some((path) => pathname.startsWith(path))) {
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
