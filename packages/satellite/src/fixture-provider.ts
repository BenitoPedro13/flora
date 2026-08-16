import type { BBox } from "@flora/contracts";
import type {
  FetchAllIndexRastersInput,
  FetchAllIndexRastersResult,
  FetchIndexRasterInput,
  FetchIndexRasterResult,
  FetchTrueColorRasterInput,
  FetchTrueColorRasterResult,
  FindLatestSceneInput,
  Scene,
  SatelliteProvider,
} from "./provider.js";

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
 *
 * `fetchAllIndexRasters` (`TASK-spectral-indices` §2.1) replays the same
 * `indexGeotiff` for every requested index rather than ten distinct ones —
 * a real fixture would carry one GeoTIFF per index, but this provider has no
 * caller in this codebase that reaches that method yet
 * (`packages/db/src/seed-satellite.ts` calls the raster pipeline directly,
 * not through `SatelliteProvider` — §2 note on why the seed script is
 * unaffected by this task).
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

  async fetchAllIndexRasters(input: FetchAllIndexRastersInput): Promise<FetchAllIndexRastersResult> {
    const indexGeotiffs = new Map(input.indices.map((index) => [index, this.fixture.indexGeotiff]));
    return { indexGeotiffs, sclGeotiff: this.fixture.sclGeotiff, bbox: this.fixture.bbox };
  }

  async fetchTrueColorRaster(_input: FetchTrueColorRasterInput): Promise<FetchTrueColorRasterResult> {
    return { rgbGeotiff: this.fixture.indexGeotiff, sclGeotiff: this.fixture.sclGeotiff, bbox: this.fixture.bbox };
  }
}
