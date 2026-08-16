import { SatelliteError } from "../errors.js";

/**
 * OAuth2 client-credentials against CDSE's own identity host — **not**
 * `services.sentinel-hub.com`, the pre-CDSE Sentinel Hub SaaS host
 * (architecture §11.1's `[VERIFY]`, resolved: Keycloak-backed, confirmed
 * against CDSE's own openEO client-credentials documentation).
 */
const TOKEN_ENDPOINT = "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token";

/** Never in Postgres, never sent to the browser (§7.4). */
const REDIS_KEY = "satellite:cdse:token";

/** Refreshed on demand, 60s before the token's own `expires_in` — never a hardcoded lifetime, since CDSE's docs don't commit to an exact figure. */
const SAFETY_MARGIN_SECONDS = 60;

/** Structurally what `ioredis`'s client already implements — the worker passes its real client, tests pass an in-memory fake. */
export interface TokenCache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: "EX", seconds: number): Promise<unknown>;
}

export interface CdseCredentials {
  clientId: string;
  clientSecret: string;
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
}

export async function getAccessToken(
  cache: TokenCache,
  credentials: CdseCredentials,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const cached = await cache.get(REDIS_KEY);
  if (cached) {
    return cached;
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: credentials.clientId,
    client_secret: credentials.clientSecret,
  });
  const res = await fetchImpl(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw new SatelliteError(`CDSE token request failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as TokenResponse;
  const ttl = Math.max(1, json.expires_in - SAFETY_MARGIN_SECONDS);
  await cache.set(REDIS_KEY, json.access_token, "EX", ttl);
  return json.access_token;
}
