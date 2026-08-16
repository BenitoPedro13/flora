import { describe, expect, it, vi } from "vitest";
import { RateLimitedError } from "../errors.js";
import { findLatestScene } from "./catalog.js";

describe("findLatestScene", () => {
  it("returns the most recent feature by datetime, not necessarily the first result", async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      async () =>
        new Response(
          JSON.stringify({
            features: [
              { id: "scene-old", properties: { datetime: "2026-07-01T10:00:00Z", "eo:cloud_cover": 5 } },
              { id: "scene-new", properties: { datetime: "2026-08-10T10:00:00Z", "eo:cloud_cover": 8 } },
            ],
          }),
          { status: 200 },
        ),
    );

    const scene = await findLatestScene(
      "tok",
      { bbox: [0, 0, 1, 1], from: "2026-07-01", to: "2026-08-15", maxCloudCoverPct: 20 },
      fetchImpl,
    );

    expect(scene).toEqual({ id: "scene-new", date: "2026-08-10", cloudCoverPct: 8 });
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
