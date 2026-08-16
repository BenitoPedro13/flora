import { describe, expect, it, vi } from "vitest";
import { RateLimitedError } from "../errors.js";
import { fetchIndexRaster } from "./process.js";

const BOUNDARY = {
  type: "MultiPolygon" as const,
  coordinates: [
    [
      [
        [-59.13, -4.58] as [number, number],
        [-59.12, -4.58] as [number, number],
        [-59.12, -4.57] as [number, number],
        [-59.13, -4.58] as [number, number],
      ],
    ],
  ],
};

describe("fetchIndexRaster", () => {
  it("posts the evalscript and boundary geometry, and parses the two multipart parts", async () => {
    const indexBytes = new Uint8Array([1, 2, 3]);
    const sclBytes = new Uint8Array([4, 5]);
    const form = new FormData();
    form.set("index", new Blob([indexBytes], { type: "image/tiff" }));
    form.set("scl", new Blob([sclBytes], { type: "image/tiff" }));

    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(form, { status: 200 }));

    const result = await fetchIndexRaster(
      "tok",
      { boundary: BOUNDARY, sceneDate: "2026-08-10", index: "ndvi", widthPx: 100, heightPx: 100 },
      fetchImpl,
    );

    expect(new Uint8Array(result.indexGeotiff)).toEqual(indexBytes);
    expect(new Uint8Array(result.sclGeotiff)).toEqual(sclBytes);

    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://sh.dataspace.copernicus.eu/api/v1/process");
    const body = JSON.parse((init as RequestInit).body as string) as {
      input: { bounds: { geometry: unknown }; data: [{ type: string }] };
      output: { responses: Array<{ identifier: string }> };
    };
    expect(body.input.bounds.geometry).toEqual(BOUNDARY);
    expect(body.input.data[0]!.type).toBe("sentinel-2-l2a");
    expect(body.output.responses.map((r) => r.identifier)).toEqual(["index", "scl"]);
  });

  it("throws RateLimitedError on 429", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response("", { status: 429 }));
    await expect(
      fetchIndexRaster(
        "tok",
        { boundary: BOUNDARY, sceneDate: "2026-08-10", index: "ndvi", widthPx: 100, heightPx: 100 },
        fetchImpl,
      ),
    ).rejects.toThrow(RateLimitedError);
  });
});
