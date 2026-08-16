import type { MultiPolygon, ObservationIndex } from "@flora/contracts";
import { SatelliteError, RateLimitedError } from "../errors.js";
import { evalscriptFor } from "./evalscript.js";

/**
 * Confirmed against a live CDSE notebook sample (§10 of the task doc records the resolution
 * date) — but **not re-confirmed against a real account** (`TASK-crop-stress` §9, 2026-08-16,
 * architecture §11.1): the Process API's own docs page consistently show
 * `sh.dataspace.copernicus.eu/process/v1` instead. Verify which is right before `TASK-satellite-live` ships.
 */
const PROCESS_ENDPOINT = "https://sh.dataspace.copernicus.eu/api/v1/process";
const SENTINEL_2_L2A_TYPE = "sentinel-2-l2a";

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
 * One Process API call, two named `output.responses[]` (`index`, `scl`),
 * assumed returned as `multipart/form-data` — one `image/tiff` part per
 * identifier.
 * `[VERIFY, escalated 2026-08-16 (`TASK-crop-stress` §9, architecture
 * §11.1): the Process API's own docs page for multiple `output.responses[]`
 * entries shows the client sending `Accept: application/tar` and the server
 * returning a **TAR archive**, not `multipart/form-data` — this function
 * sends no `Accept` header and calls `res.formData()`, which would be wrong
 * if that's right. Still not independently confirmed against a live CDSE
 * response (this session had a real account for the first time, but not
 * write access to fix-and-verify this file — `TASK-satellite-live`'s to
 * pick up). `packages/satellite` has no tar-parsing dependency if the fix
 * is needed.]` `input.bounds.geometry` takes the raw GeoJSON geometry
 * object directly, not wrapped in a Feature (confirmed against the
 * Statistical API's `bounds` example, which shares this shape).
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
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.status === 429) {
    const retryAfter = res.headers.get("Retry-After");
    throw new RateLimitedError(retryAfter ? Number(retryAfter) : undefined);
  }
  if (!res.ok) {
    throw new SatelliteError(`CDSE process request failed: ${res.status} ${await res.text()}`);
  }

  const form = await res.formData();
  const indexPart = form.get("index");
  const sclPart = form.get("scl");
  if (!(indexPart instanceof Blob) || !(sclPart instanceof Blob)) {
    throw new SatelliteError("CDSE process response was missing the 'index' or 'scl' multipart part");
  }

  return {
    indexGeotiff: await indexPart.arrayBuffer(),
    sclGeotiff: await sclPart.arrayBuffer(),
  };
}
