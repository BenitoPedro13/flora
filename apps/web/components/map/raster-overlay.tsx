import { Layer, Source } from "react-map-gl/mapbox";
import type { BBox } from "@flora/contracts";
import { FIELDS_FILL_LAYER_ID } from "./field-map";

export interface RasterOverlayProps {
  rasterUrl: string;
  bbox: BBox;
}

/**
 * The NDVI raster as a Mapbox image source (TASK-crop-stress §2.6, §3.5,
 * invariant 2 — one pre-rendered PNG already in R2, not a tile pyramid).
 * `coordinates` is Mapbox's required clockwise-from-top-left order —
 * `[[w,n],[e,n],[e,s],[w,s]]`. `beforeId` inserts the layer below the field
 * boundary lines `FieldMap` already draws, so a zone's white outline reads
 * on top of the red/orange patch under it rather than being covered by it.
 *
 * The PNG's pixel grid is linear in lon/lat (`packages/raster/src/
 * vectorise.ts`'s `pixelToLonLat`), while Mapbox warps an image source
 * linearly in Web Mercator — the two disagree by the Mercator/equirectangular
 * difference across the image's own height. Sub-pixel at field scale (~1 km
 * extent, 512 px), but unverified against the seeded Field 237 raster at
 * high zoom
 * `[VERIFY: measure the corner-to-corner offset of the seeded Field 237
 * raster against its boundary polygon at zoom 16; if visible, the fix is
 * rendering the PNG in Web Mercator in the worker, not nudging coordinates
 * here]`.
 */
export function RasterOverlay({ rasterUrl, bbox }: RasterOverlayProps) {
  const [west, south, east, north] = bbox;
  const coordinates: [[number, number], [number, number], [number, number], [number, number]] = [
    [west, north],
    [east, north],
    [east, south],
    [west, south],
  ];

  return (
    <Source id="observation-raster" type="image" url={rasterUrl} coordinates={coordinates}>
      <Layer
        id="observation-raster-layer"
        type="raster"
        beforeId={FIELDS_FILL_LAYER_ID}
        paint={{
          "raster-opacity": 1,
          "raster-opacity-transition": { duration: 200 },
          "raster-fade-duration": 200,
        }}
      />
    </Source>
  );
}
