import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { RateLimitedError, SatelliteError } from "../errors.js";
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

/**
 * The real 6656-byte response body captured against a live CDSE account, 2026-08-14 —
 * `__fixtures__/README.md` records the exact request. Architecture §13: replay real bytes,
 * not a hand-built mock.
 */
const REAL_TAR = readFileSync(fileURLToPath(new URL("./__fixtures__/process-ndvi-2026-08-14.tar", import.meta.url)));

describe("fetchIndexRaster", () => {
  it("sends Accept: application/tar and parses the real captured TAR response by member name", async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      async () => new Response(REAL_TAR, { status: 200, headers: { "Content-Type": "application/x-tar" } }),
    );

    const result = await fetchIndexRaster(
      "tok",
      { boundary: BOUNDARY, sceneDate: "2026-08-14", index: "ndvi", widthPx: 128, heightPx: 128 },
      fetchImpl,
    );

    expect(result.indexGeotiff.byteLength).toBe(4845);
    expect(result.sclGeotiff.byteLength).toBe(447);

    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://sh.dataspace.copernicus.eu/api/v1/process");
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers["Accept"]).toBe("application/tar");

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

  it("throws a named error (not undici's) when the server silently collapses to a bare image/tiff", async () => {
    // The real, observed behaviour when no Accept header is sent: 200, one bare TIFF, no error,
    // `scl` silently dropped (`TASK-satellite-live` §1.2, finding 3).
    const bareTiff = new Uint8Array([0x49, 0x49, 0x2a, 0x00]);
    const fetchImpl = vi.fn<typeof fetch>(
      async () => new Response(bareTiff, { status: 200, headers: { "Content-Type": "image/tiff" } }),
    );

    let caught: unknown;
    try {
      await fetchIndexRaster(
        "tok",
        { boundary: BOUNDARY, sceneDate: "2026-08-14", index: "ndvi", widthPx: 128, heightPx: 128 },
        fetchImpl,
      );
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(SatelliteError);
    expect((caught as Error).message).toContain("application/x-tar");
    expect((caught as Error).message).not.toContain("Content-Type was not one of");
  });

  it("throws a SatelliteError naming the members found when the TAR is missing scl.tif", async () => {
    // A real ustar archive with a single "index.tif" member, hand-built here (not from CDSE) to
    // exercise the missing-member branch, which no captured fixture demonstrates.
    const { createTar } = await import("nanotar");
    const partialTar = createTar([{ name: "index.tif", data: new Uint8Array([1, 2, 3]) }]);
    const fetchImpl = vi.fn<typeof fetch>(
      async () => new Response(partialTar, { status: 200, headers: { "Content-Type": "application/x-tar" } }),
    );

    let caught: unknown;
    try {
      await fetchIndexRaster(
        "tok",
        { boundary: BOUNDARY, sceneDate: "2026-08-14", index: "ndvi", widthPx: 128, heightPx: 128 },
        fetchImpl,
      );
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(SatelliteError);
    expect((caught as Error).message).toContain("index.tif");
    expect((caught as Error).message).not.toContain("Content-Type was not one of");
  });
});
