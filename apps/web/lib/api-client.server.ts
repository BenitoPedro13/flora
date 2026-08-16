import { cookies } from "next/headers";
import type { ZodType } from "zod";
import { parseResponse } from "./api-client";

/**
 * Server Components / Route Handlers only — forwards the incoming request's
 * cookies to `API_URL` directly (this runs on the server, not subject to
 * `next.config.ts`'s browser-only rewrite proxy — same reasoning as
 * `lib/session.ts`). Kept out of `lib/api-client.ts` so nothing imports
 * `next/headers` into a Client Component's bundle.
 */
export async function apiFetchServer<T>(path: string, schema?: ZodType<T>, init?: RequestInit): Promise<T> {
  const apiUrl = process.env.API_URL;
  if (!apiUrl) {
    throw new Error("API_URL is not set");
  }
  const cookieStore = await cookies();
  const res = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: { ...init?.headers, cookie: cookieStore.toString() },
    cache: "no-store",
  });
  return parseResponse(res, schema);
}
