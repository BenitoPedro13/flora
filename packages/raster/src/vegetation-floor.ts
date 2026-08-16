import type { ObservationIndex } from "@flora/contracts";

/**
 * The 0.10 "this pixel is bare soil/water/etc, not stressed vegetation"
 * floor `TASK-satellite-pipeline` §7.5 defined for NDVI. Shared by
 * `raster.ts` (excludes floor pixels from stats) and `ramp.ts` (renders them
 * transparent) so the two never disagree about which pixels count as "the
 * field" — the same reasoning `floorFilteredSortedValues` already documents
 * for stats vs. `detect.ts`'s threshold.
 *
 * `TASK-spectral-indices` §2.3 generalised the pipeline to nine more
 * indices, and this floor does not generalise with it: it's a fact about
 * NDVI-shaped ratios `(a-b)/(a+b)` bounded ~-1..1 where "near zero or below"
 * reads as non-vegetation. Applying it to NDWI would hide the water a
 * wetness layer exists to show (high NDWI *is* the interesting case, not
 * noise to exclude); RECI and MCARI aren't on that 0..1 scale at all (§1.4).
 * Limited to the indices that share NDVI's actual shape and the assumption
 * the floor was built on — not extended by default to "index unknown".
 *
 * **`ndmi` removed, found live 2026-08-16:** NDMI is a *moisture* index, not
 * a canopy-vigor one — a dry field reading low NDMI is real, useful data
 * (arguably the whole point of a moisture layer), not noise to hide the way
 * bare soil is for NDVI. Shipping it in this set floored an entire dry
 * field's pixels below 0.10 and rendered it fully transparent — the exact
 * same "green is good, so hide the low end" mistake §2.3 already reasoned
 * through for NDWI, made anyway for NDMI because it was a ratio and looked
 * NDVI-shaped. Kept: NDVI, NDRE, EVI, MSAVI — genuine canopy-vigor indices
 * where near-zero really does mean "not vegetation."
 */
export const NON_VEGETATION_FLOOR = 0.1;

const VEGETATION_FLOOR_INDICES: ReadonlySet<ObservationIndex> = new Set(["ndvi", "ndre", "evi", "msavi"]);

/** `undefined` defaults to `true` (NDVI's own shape) so every pre-existing caller keeps its exact prior behaviour. */
export function indexHasVegetationFloor(index?: ObservationIndex): boolean {
  if (index === undefined) {
    return true;
  }
  return VEGETATION_FLOOR_INDICES.has(index);
}
