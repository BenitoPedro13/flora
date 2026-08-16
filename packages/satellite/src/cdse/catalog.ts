import type { BBox } from "@flora/contracts";
import { SatelliteError, RateLimitedError } from "../errors.js";
import type { Scene } from "../provider.js";

/**
 * STAC-compliant search on the Sentinel-Hub-authenticated CDSE host — shares
 * the OAuth audience with the Process API, unlike the general CDSE STAC
 * catalog at `stac.dataspace.copernicus.eu` (a separate service with a
 * different cloud-cover scale). Collection id and the `eo:cloud_cover`
 * field name confirmed against CDSE's own Catalog API docs.
 */
const CATALOG_ENDPOINT = "https://sh.dataspace.copernicus.eu/catalog/v1/search";
const SENTINEL_2_L2A_COLLECTION = "sentinel-2-l2a";

interface StacFeature {
  id: string;
  properties: {
    datetime: string;
    "eo:cloud_cover": number;
  };
}

interface StacSearchResponse {
  features: StacFeature[];
}

/** No server-side "latest first" sort documented — the client sorts the returned features itself. */
export async function findLatestScene(
  token: string,
  input: { bbox: BBox; from: string; to: string; maxCloudCoverPct: number },
  fetchImpl: typeof fetch = fetch,
): Promise<Scene | null> {
  const body = {
    collections: [SENTINEL_2_L2A_COLLECTION],
    bbox: input.bbox,
    datetime: `${input.from}T00:00:00Z/${input.to}T23:59:59Z`,
    filter: `eo:cloud_cover < ${input.maxCloudCoverPct}`,
    limit: 100,
  };

  const res = await fetchImpl(CATALOG_ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.status === 429) {
    const retryAfter = res.headers.get("Retry-After");
    throw new RateLimitedError(retryAfter ? Number(retryAfter) : undefined);
  }
  if (!res.ok) {
    throw new SatelliteError(`CDSE catalog search failed: ${res.status} ${await res.text()}`);
  }

  const json = (await res.json()) as StacSearchResponse;
  if (json.features.length === 0) {
    return null;
  }
  const [latest] = [...json.features].sort((a, b) => b.properties.datetime.localeCompare(a.properties.datetime));
  return {
    id: latest!.id,
    date: latest!.properties.datetime.slice(0, 10),
    cloudCoverPct: latest!.properties["eo:cloud_cover"],
  };
}
