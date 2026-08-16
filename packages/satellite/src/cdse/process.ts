import type { MultiPolygon, ScalarIndex } from "@flora/contracts";
import { parseTar } from "nanotar";
import { SatelliteError, RateLimitedError } from "../errors.js";
import { evalscriptFor, evalscriptForAll, evalscriptForTrueColor } from "./evalscript.js";

/**
 * Measured live 2026-08-16 (`TASK-satellite-live` §1.2): `/api/v1/process` and the docs'
 * `/process/v1` are live aliases, byte-identical (200, same body) both with and without
 * `Accept: application/tar`. Keeping this path — no reason to churn it.
 */
const PROCESS_ENDPOINT = "https://sh.dataspace.copernicus.eu/api/v1/process";
const SENTINEL_2_L2A_TYPE = "sentinel-2-l2a";
/** Only format this codebase ever requests (`output.responses[].format.type` below) — not a general mime→extension table. */
const TIFF_EXTENSION = ".tif";

interface ProcessCallInput {
  boundary: MultiPolygon;
  sceneDate: string;
  widthPx: number;
  heightPx: number;
  responseIdentifiers: string[];
  evalscript: string;
}

/**
 * The one HTTP conversation with CDSE's Process API, shared by the
 * single-index and all-indices callers below — everything from here down is
 * about *what's requested*, not *how the request is made*
 * (`TASK-spectral-indices` §2.1).
 *
 * Measured live against a real account, 2026-08-16 (`TASK-satellite-live` §1.2):
 * with `Accept: application/tar` the server returns `Content-Type: application/x-tar`,
 * a ustar archive with exactly one member per `output.responses[]` entry, named
 * `<identifier>.tif`. **Without** an `Accept` header the server does not error — it
 * silently collapses to a single bare `image/tiff` body (the first output only, the
 * rest dropped), which is what previously made `res.formData()` throw undici's
 * `Content-Type was not one of "multipart/form-data" or "application/x-www-form-urlencoded".`
 * before any Flora code ran. That string was never a server error; it is undici's
 * `Response.formData()` refusing to parse a TIFF as a form.
 *
 * `input.bounds.geometry` takes the raw GeoJSON geometry object directly, not wrapped in a
 * Feature (confirmed against the Statistical API's `bounds` example, which shares this shape).
 *
 * Verified for **11 named outputs** while planning `TASK-spectral-indices` (§1.3): 200 OK,
 * `application/x-tar`, 2.7s, 976KB, one `.tif` member per output, no ceiling hit at 512×512 —
 * so this same call shape scales from 2 outputs to 11 with no new branch needed.
 */
async function callProcess(
  token: string,
  input: ProcessCallInput,
  fetchImpl: typeof fetch,
): Promise<Map<string, ArrayBuffer>> {
  const body = {
    input: {
      bounds: { geometry: input.boundary },
      data: [
        {
          type: SENTINEL_2_L2A_TYPE,
          dataFilter: {
            timeRange: { from: `${input.sceneDate}T00:00:00Z`, to: `${input.sceneDate}T23:59:59Z` },
          },
        },
      ],
    },
    output: {
      width: input.widthPx,
      height: input.heightPx,
      responses: input.responseIdentifiers.map((identifier) => ({
        identifier,
        format: { type: "image/tiff" },
      })),
    },
    evalscript: input.evalscript,
  };

  const res = await fetchImpl(PROCESS_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/tar",
    },
    body: JSON.stringify(body),
  });
  if (res.status === 429) {
    const retryAfter = res.headers.get("Retry-After");
    throw new RateLimitedError(retryAfter ? Number(retryAfter) : undefined);
  }
  if (!res.ok) {
    throw new SatelliteError(`CDSE process request failed: ${res.status} ${await res.text()}`);
  }

  const contentType = res.headers.get("content-type");
  if (!contentType?.startsWith("application/x-tar")) {
    throw new SatelliteError(
      `CDSE process returned ${contentType} (expected application/x-tar) — Accept header or output.responses[] shape changed`,
    );
  }

  const archiveBytes = await res.arrayBuffer();
  const members = parseTar(archiveBytes);
  const byName = new Map<string, ArrayBuffer>();
  for (const identifier of input.responseIdentifiers) {
    const member = members.find((m) => m.name === `${identifier}${TIFF_EXTENSION}`);
    if (!member?.data) {
      const found = members.map((m) => m.name).join(", ") || "(none)";
      throw new SatelliteError(
        `CDSE process TAR was missing '${identifier}${TIFF_EXTENSION}' — members found: ${found}`,
      );
    }
    byName.set(identifier, member.data.slice().buffer as ArrayBuffer);
  }
  return byName;
}

export interface ProcessRequestInput {
  boundary: MultiPolygon;
  sceneDate: string;
  index: ScalarIndex;
  widthPx: number;
  heightPx: number;
}

export interface ProcessResult {
  indexGeotiff: ArrayBuffer;
  sclGeotiff: ArrayBuffer;
}

/** One Process API call, two named `output.responses[]` (`index`, `scl`) — the single-layer path (§2.1). */
export async function fetchIndexRaster(
  token: string,
  input: ProcessRequestInput,
  fetchImpl: typeof fetch = fetch,
): Promise<ProcessResult> {
  const members = await callProcess(
    token,
    {
      boundary: input.boundary,
      sceneDate: input.sceneDate,
      widthPx: input.widthPx,
      heightPx: input.heightPx,
      responseIdentifiers: ["index", "scl"],
      evalscript: evalscriptFor(input.index),
    },
    fetchImpl,
  );
  return { indexGeotiff: members.get("index")!, sclGeotiff: members.get("scl")! };
}

export interface ProcessAllRequestInput {
  boundary: MultiPolygon;
  sceneDate: string;
  indices: readonly ScalarIndex[];
  widthPx: number;
  heightPx: number;
}

export interface ProcessAllResult {
  /** One GeoTIFF per requested index, keyed by index — same order as `indices`, but callers should key by name, not position. */
  indexGeotiffs: Map<ScalarIndex, ArrayBuffer>;
  sclGeotiff: ArrayBuffer;
}

/**
 * One Process API call, every scalar index in `indices` plus `scl` — the
 * daily-refresh path (§2.1, §7 decision 6). Costs exactly what a two-output
 * call with the same input bands costs (§1.3): cost is a function of input
 * bands only, measured against the live account, not assumed from the docs.
 */
export async function fetchAllIndexRasters(
  token: string,
  input: ProcessAllRequestInput,
  fetchImpl: typeof fetch = fetch,
): Promise<ProcessAllResult> {
  const members = await callProcess(
    token,
    {
      boundary: input.boundary,
      sceneDate: input.sceneDate,
      widthPx: input.widthPx,
      heightPx: input.heightPx,
      responseIdentifiers: [...input.indices, "scl"],
      evalscript: evalscriptForAll(input.indices),
    },
    fetchImpl,
  );
  const indexGeotiffs = new Map<ScalarIndex, ArrayBuffer>();
  for (const index of input.indices) {
    indexGeotiffs.set(index, members.get(index)!);
  }
  return { indexGeotiffs, sclGeotiff: members.get("scl")! };
}

export interface ProcessTrueColorRequestInput {
  boundary: MultiPolygon;
  sceneDate: string;
  widthPx: number;
  heightPx: number;
}

export interface ProcessTrueColorResult {
  /** One 3-band GeoTIFF (R, G, B). */
  rgbGeotiff: ArrayBuffer;
  /**
   * The clip-geometry nodata signal (`raster.ts`'s `decodeGeoTiff` doc
   * comment) — the RGB formula has no division, so it can't fall back on
   * `0/0 = NaN` the way every scalar index does. Found live the same day
   * this path first shipped.
   */
  sclGeotiff: ArrayBuffer;
}

/** The on-demand-only true-colour path (§2.5) — never part of the scalar-index bulk call. */
export async function fetchTrueColorRaster(
  token: string,
  input: ProcessTrueColorRequestInput,
  fetchImpl: typeof fetch = fetch,
): Promise<ProcessTrueColorResult> {
  const members = await callProcess(
    token,
    {
      boundary: input.boundary,
      sceneDate: input.sceneDate,
      widthPx: input.widthPx,
      heightPx: input.heightPx,
      responseIdentifiers: ["true_color", "scl"],
      evalscript: evalscriptForTrueColor(),
    },
    fetchImpl,
  );
  return { rgbGeotiff: members.get("true_color")!, sclGeotiff: members.get("scl")! };
}
