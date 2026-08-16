import type { BBox } from "@flora/contracts";
import type { FetchIndexRasterInput, FetchIndexRasterResult, FindLatestSceneInput, Scene, SatelliteProvider } from "./provider.js";

/**
 * Replays a supplied fixture instead of calling CDSE — what makes the
 * worker's raster pipeline (and `packages/db`'s satellite seed) testable
 * with no CDSE credentials at all (§1.1's seam, §2.2).
 *
 * **Deviation, recorded honestly (§10):** the plan was a fixture *recorded*
 * from a live CDSE response, replayed from a committed file under
 * `test/fixtures/`. This session has no CDSE credentials, so there is no
 * live response to record — `fixture` is supplied by the caller instead
 * (`packages/db/src/seed-satellite.ts` builds one from a synthetic-but-known
 * GeoTIFF pair, the same pattern `packages/raster/src/golden.spec.ts` uses).
 * The shape is unchanged either way: whoever captures a real fixture later
 * just constructs this same `FixtureData` from the recorded bytes.
 */
export interface FixtureData {
  scene: Scene | null;
  indexGeotiff: ArrayBuffer;
  sclGeotiff: ArrayBuffer;
  bbox: BBox;
}

export class FixtureSatelliteProvider implements SatelliteProvider {
  constructor(private readonly fixture: FixtureData) {}

  async findLatestScene(_input: FindLatestSceneInput): Promise<Scene | null> {
    return this.fixture.scene;
  }

  async fetchIndexRaster(_input: FetchIndexRasterInput): Promise<FetchIndexRasterResult> {
    return {
      indexGeotiff: this.fixture.indexGeotiff,
      sclGeotiff: this.fixture.sclGeotiff,
      bbox: this.fixture.bbox,
    };
  }
}
