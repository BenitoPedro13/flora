import type { ProblemDetails } from "@flora/contracts";
import type { ZodType } from "zod";

/**
 * `lib/session.ts` generalised (TASK-fields §2.11): a thin fetch wrapper
 * that parses every response through the contract schema for its shape
 * (invariant 4) and surfaces `application/problem+json` errors as a typed
 * exception instead of a generic non-2xx. Client-safe — `apiFetchServer`
 * lives in `lib/api-client.server.ts` because it imports `next/headers`,
 * which breaks the build if it reaches a Client Component's bundle even
 * unused (Next.js bundles a file's whole module graph, not just the export
 * a caller touches).
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly problem: ProblemDetails | null,
  ) {
    super(problem?.detail ?? problem?.title ?? `Request failed with status ${status}`);
    this.name = "ApiError";
  }
}

export async function parseResponse<T>(res: Response, schema?: ZodType<T>): Promise<T> {
  if (!res.ok) {
    const problem = (await res.json().catch(() => null)) as ProblemDetails | null;
    throw new ApiError(res.status, problem);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  const json: unknown = await res.json();
  return schema ? schema.parse(json) : (json as T);
}

/**
 * Client Components — hits the same-origin `/api/v1/*` path `next.config.ts`
 * proxies to `API_URL`, so the browser's own cookie jar handles auth with no
 * header forwarding needed.
 */
export async function apiFetchClient<T>(path: string, schema?: ZodType<T>, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, credentials: "same-origin" });
  return parseResponse(res, schema);
}
