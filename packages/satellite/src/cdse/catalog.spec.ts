import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { RateLimitedError } from "../errors.js";
import { findLatestScene } from "./catalog.js";

/**
 * The real catalog/v1/search response captured against a live CDSE account, 2026-08-16, for
 * Field 237's bbox — truncated to 3 of the real 87 features. `__fixtures__/README.md` records
 * the exact request. Architecture §13: replay real bytes, not a hand-built mock.
 */
const REAL_CATALOG_RESPONSE = readFileSync(
  fileURLToPath(new URL("./__fixtures__/catalog-search-2026-08-14.json", import.meta.url)),
  "utf8",
);

describe("findLatestScene", () => {
  it("returns the most recent feature by datetime from a real captured response", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(REAL_CATALOG_RESPONSE, { status: 200 }));

    const scene = await findLatestScene(
      "tok",
      { bbox: [-59.1343, -4.5841, -59.1313, -4.5821], from: "2026-01-01", to: "2026-08-16", maxCloudCoverPct: 90 },
      fetchImpl,
    );

    expect(scene).toEqual({
      id: "S2C_MSIL2A_20260814T141711_N0512_R010_T21MTQ_20260814T191310.SAFE",
      date: "2026-08-14",
      cloudCoverPct: 0,
    });

    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://sh.dataspace.copernicus.eu/catalog/v1/search");
    const body = JSON.parse((init as RequestInit).body as string) as { collections: string[] };
    expect(body.collections).toEqual(["sentinel-2-l2a"]);
  });

  it("returns null when no scene matches", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ features: [] }), { status: 200 }));
    const scene = await findLatestScene(
      "tok",
      { bbox: [0, 0, 1, 1], from: "2026-07-01", to: "2026-08-15", maxCloudCoverPct: 20 },
      fetchImpl,
    );
    expect(scene).toBeNull();
  });

  it("throws RateLimitedError with retryAfterSeconds on 429", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response("", { status: 429, headers: { "Retry-After": "30" } }));
    let caught: unknown;
    try {
      await findLatestScene(
        "tok",
        { bbox: [0, 0, 1, 1], from: "2026-07-01", to: "2026-08-15", maxCloudCoverPct: 20 },
        fetchImpl,
      );
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(RateLimitedError);
    expect((caught as RateLimitedError).retryAfterSeconds).toBe(30);
  });
});
