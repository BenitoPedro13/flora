import type { MultiPolygon, ObservationIndex } from "@flora/contracts";
import { parseTar } from "nanotar";
import { SatelliteError, RateLimitedError } from "../errors.js";
import { evalscriptFor } from "./evalscript.js";

/**
 * Measured live 2026-08-16 (`TASK-satellite-live` §1.2): `/api/v1/process` and the docs'
 * `/process/v1` are live aliases, byte-identical (200, same body) both with and without
 * `Accept: application/tar`. Keeping this path — no reason to churn it.
 */
const PROCESS_ENDPOINT = "https://sh.dataspace.copernicus.eu/api/v1/process";
const SENTINEL_2_L2A_TYPE = "sentinel-2-l2a";
/** Only format this codebase ever requests (`output.responses[].format.type` below) — not a general mime→extension table. */
const TIFF_EXTENSION = ".tif";

export interface ProcessRequestInput {
  boundary: MultiPolygon;
  sceneDate: string;
  index: ObservationIndex;
  widthPx: number;
  heightPx: number;
}

export interface ProcessResult {
  indexGeotiff: ArrayBuffer;
  sclGeotiff: ArrayBuffer;
}

/**
 * One Process API call, two named `output.responses[]` (`index`, `scl`).
 *
 * Measured live against a real account, 2026-08-16 (`TASK-satellite-live` §1.2):
 * with `Accept: application/tar` the server returns `Content-Type: application/x-tar`,
 * a ustar archive with exactly one member per `output.responses[]` entry, named
 * `<identifier>.tif` (`index.tif`, `scl.tif`). **Without** an `Accept` header the server
 * does not error — it silently collapses to a single bare `image/tiff` body (`index` only,
 * `scl` dropped), which is what previously made `res.formData()` throw undici's
 * `Content-Type was not one of "multipart/form-data" or "application/x-www-form-urlencoded".`
 * before any Flora code ran. That string was never a server error; it is undici's
 * `Response.formData()` refusing to parse a TIFF as a form.
 *
 * `input.bounds.geometry` takes the raw GeoJSON geometry object directly, not wrapped in a
 * Feature (confirmed against the Statistical API's `bounds` example, which shares this shape).
 */
export async function fetchIndexRaster(
  token: string,
  input: ProcessRequestInput,
  fetchImpl: typeof fetch = fetch,
): Promise<ProcessResult> {
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
      responses: [
        { identifier: "index", format: { type: "image/tiff" } },
        { identifier: "scl", format: { type: "image/tiff" } },
      ],
    },
    evalscript: evalscriptFor(input.index),
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
  const indexMember = members.find((m) => m.name === `index${TIFF_EXTENSION}`);
  const sclMember = members.find((m) => m.name === `scl${TIFF_EXTENSION}`);
  if (!indexMember?.data || !sclMember?.data) {
    const found = members.map((m) => m.name).join(", ") || "(none)";
    throw new SatelliteError(`CDSE process TAR was missing 'index.tif' or 'scl.tif' — members found: ${found}`);
  }

  return {
    indexGeotiff: indexMember.data.slice().buffer as ArrayBuffer,
    sclGeotiff: sclMember.data.slice().buffer as ArrayBuffer,
  };
}
