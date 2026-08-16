import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { scalarIndexValues } from "@flora/contracts";
import { createTar } from "nanotar";
import { describe, expect, it, vi } from "vitest";
import { RateLimitedError, SatelliteError } from "../errors.js";
import { fetchAllIndexRasters, fetchIndexRaster, fetchTrueColorRaster } from "./process.js";

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

describe("fetchAllIndexRasters", () => {
  /**
   * No live 11-output fixture is committed — the B/C run in
   * `TASK-spectral-indices` §1.3 was made live during planning but not
   * captured to a file. Hand-built here (not from CDSE), same precedent as
   * `process.spec.ts`'s own "missing member" case above.
   */
  it("requests every scalar index plus scl in one call, and parses all of them back by name", async () => {
    const members = [
      ...scalarIndexValues.map((index) => ({ name: `${index}.tif`, data: new Uint8Array([1, 2, 3]) })),
      { name: "scl.tif", data: new Uint8Array([4, 5, 6]) },
    ];
    const tar = createTar(members);
    const fetchImpl = vi.fn<typeof fetch>(
      async () => new Response(tar, { status: 200, headers: { "Content-Type": "application/x-tar" } }),
    );

    const result = await fetchAllIndexRasters(
      "tok",
      { boundary: BOUNDARY, sceneDate: "2026-08-14", indices: scalarIndexValues, widthPx: 512, heightPx: 512 },
      fetchImpl,
    );

    expect(result.indexGeotiffs.size).toBe(scalarIndexValues.length);
    for (const index of scalarIndexValues) {
      expect(result.indexGeotiffs.get(index)).toBeDefined();
    }
    expect(result.sclGeotiff.byteLength).toBe(3);

    const [, init] = fetchImpl.mock.calls[0]!;
    const body = JSON.parse((init as RequestInit).body as string) as {
      output: { responses: Array<{ identifier: string }> };
      evalscript: string;
    };
    expect(body.output.responses.map((r) => r.identifier)).toEqual([...scalarIndexValues, "scl"]);
    expect(body.evalscript).toContain('input: [{ bands: ["B02","B03","B04","B05","B08","B11","SCL"] }]');
  });

  it("throws naming the missing member when a requested index isn't in the TAR", async () => {
    const tar = createTar([
      { name: "ndvi.tif", data: new Uint8Array([1]) },
      { name: "scl.tif", data: new Uint8Array([2]) },
    ]);
    const fetchImpl = vi.fn<typeof fetch>(
      async () => new Response(tar, { status: 200, headers: { "Content-Type": "application/x-tar" } }),
    );

    await expect(
      fetchAllIndexRasters(
        "tok",
        { boundary: BOUNDARY, sceneDate: "2026-08-14", indices: ["ndvi", "ndre"], widthPx: 512, heightPx: 512 },
        fetchImpl,
      ),
    ).rejects.toThrow(/ndre\.tif/);
  });
});

describe("fetchTrueColorRaster — the on-demand path (§2.5, built as a same-day follow-on)", () => {
  it("requests both 'true_color' and 'scl', and returns both", async () => {
    // scl is requested even for true-colour — found live: the RGB formula has no division, so it
    // can't fall back on 0/0 = NaN to signal "outside the clip geometry" the way every scalar
    // index does (raster.ts's decodeGeoTiff doc comment has the full story).
    const tar = createTar([
      { name: "true_color.tif", data: new Uint8Array([9, 9, 9]) },
      { name: "scl.tif", data: new Uint8Array([7, 7]) },
    ]);
    const fetchImpl = vi.fn<typeof fetch>(
      async () => new Response(tar, { status: 200, headers: { "Content-Type": "application/x-tar" } }),
    );

    const result = await fetchTrueColorRaster(
      "tok",
      { boundary: BOUNDARY, sceneDate: "2026-08-14", widthPx: 512, heightPx: 512 },
      fetchImpl,
    );

    expect(result.rgbGeotiff.byteLength).toBe(3);
    expect(result.sclGeotiff.byteLength).toBe(2);
    const [, init] = fetchImpl.mock.calls[0]!;
    const body = JSON.parse((init as RequestInit).body as string) as {
      output: { responses: Array<{ identifier: string }> };
    };
    expect(body.output.responses.map((r) => r.identifier)).toEqual(["true_color", "scl"]);
  });
});
