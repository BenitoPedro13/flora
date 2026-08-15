import { cookies } from "next/headers";
import type { Session } from "@flora/contracts";

/**
 * Server-side session read: forwards the incoming request's cookies to
 * `GET /me` and returns the parsed session, or `null` if unauthenticated.
 * Calls apps/api's real origin (`API_URL`) directly — this runs on the
 * server, not in a browser, so it has no need for (and isn't subject to)
 * the same-origin cookie proxying next.config.ts sets up for the browser
 * (TASK-auth-tenancy §2.8).
 */
export async function getSession(): Promise<Session | null> {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();
  if (!cookieHeader) {
    return null;
  }

  const apiUrl = process.env.API_URL;
  if (!apiUrl) {
    throw new Error("API_URL is not set");
  }

  const res = await fetch(`${apiUrl}/api/v1/me`, {
    headers: { cookie: cookieHeader },
    cache: "no-store",
  });
  if (!res.ok) {
    return null;
  }
  return (await res.json()) as Session;
}
