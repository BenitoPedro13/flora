import { Layer } from "react-map-gl/mapbox";
import { LABEL_HALO_WIDTH, LABEL_TEXT_SIZE, MAP_LABEL_HALO, MAP_LABEL_TEXT } from "./config";

/**
 * The label pills — a `symbol` layer with `text-halo-width` standing in for
 * a real pill background (architecture §9.6): no sprite image, just enough
 * halo to read over photographic satellite imagery.
 */
export function FieldLabelLayer({ sourceId }: { sourceId: string }) {
  return (
    <Layer
      id="fields-label"
      type="symbol"
      source={sourceId}
      layout={{
        "text-field": ["get", "name"],
        "text-size": LABEL_TEXT_SIZE,
        "text-anchor": "center",
        "symbol-placement": "point",
      }}
      paint={{
        "text-color": MAP_LABEL_TEXT,
        "text-halo-color": MAP_LABEL_HALO,
        "text-halo-width": LABEL_HALO_WIDTH,
      }}
    />
  );
}
