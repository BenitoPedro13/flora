import { cookies } from "next/headers";

/**
 * Server-side read of the sidebar's collapsed state (design-spec §4.3's
 * `[VERIFY]`, resolved as a user toggle persisted in this cookie). Read here
 * so `(app)/layout.tsx` renders the correct width on first paint — no
 * hydration flash, no layout shift.
 */
export async function getSidebarCollapsed(): Promise<boolean> {
  const cookieStore = await cookies();
  return cookieStore.get("flora_sidebar")?.value === "collapsed";
}
