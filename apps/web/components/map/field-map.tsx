"use client";

import * as React from "react";
import bbox from "@turf/bbox";
import type { FieldFeatureCollection } from "@flora/contracts";
import { Layer, Map as MapboxMap, Source, type MapMouseEvent, type MapRef } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import {
  FIELD_FILL_OPACITY_DEFAULT,
  FIELD_FILL_OPACITY_SELECTED,
  FIELD_LINE_WIDTH_DEFAULT,
  FIELD_LINE_WIDTH_SELECTED,
  MAP_BOUNDARY_DEFAULT,
  MAP_PRIMARY,
} from "./config";
import { FieldLabelLayer } from "./field-label-layer";
import { MapPlaceholder } from "./map-placeholder";

const SOURCE_ID = "fields";
const FILL_LAYER_ID = "fields-fill";
const LINE_LAYER_ID = "fields-line";

/**
 * Exported so a child passed via `children` (`RasterOverlay`, TASK-crop-stress
 * §2.6) can pass `beforeId={FIELDS_FILL_LAYER_ID}` to insert itself below the
 * field boundary layers instead of on top, where every `<Source>`/`<Layer>`
 * added after this component's own would otherwise land.
 */
export const FIELDS_FILL_LAYER_ID = FILL_LAYER_ID;

// The design's Amazonas farm (architecture §5.3's seed coordinates) —
// the fallback camera when an org has no fields yet.
const DEFAULT_CENTER = { longitude: -59.1328, latitude: -4.5831 };

export interface FieldMapProps {
  features: FieldFeatureCollection;
  selectedFieldId: string | null;
  onSelectField: (id: string | null) => void;
  /** Double-clicking a polygon is one of the editor's three entry points (TASK-fields §2.7). */
  onFieldDoubleClick?: (id: string) => void;
  children?: React.ReactNode;
}

/**
 * The list screen's map (design-spec §5.2, resolved per TASK-fields §1.1: a
 * top-down satellite basemap carrying white boundaries and label pills, not
 * the Figma's isometric illustration — Mapbox GL has no isometric style).
 * One GeoJSON source; the selected field is styled off `feature-state`, not
 * a second source.
 */
export function FieldMap({ features, selectedFieldId, onSelectField, onFieldDoubleClick, children }: FieldMapProps) {
  const mapRef = React.useRef<MapRef | null>(null);
  const hasFittedRef = React.useRef(false);
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  // `setFeatureState`/`removeFeatureState` throw "Style is not done
  // loading" if called before the style is ready — `mapRef.current` is set
  // well before that (verified live), so this can't just gate on the ref.
  const [styleLoaded, setStyleLoaded] = React.useState(false);

  const initialViewState = React.useMemo(() => {
    if (features.features.length === 0) {
      return { longitude: DEFAULT_CENTER.longitude, latitude: DEFAULT_CENTER.latitude, zoom: 14 };
    }
    const [west, south, east, north] = bbox(features);
    return {
      bounds: [
        [west, south],
        [east, north],
      ] as [[number, number], [number, number]],
      fitBoundsOptions: { padding: 48 },
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- fit once, on the fields the map first loads with; re-fitting on every add/delete would yank the camera away from where the farmer is looking.

  React.useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    // Testability hook for NFR-11's Playwright pan test (§6 item 15) —
    // harmless outside a test runner, never read by product code.
    (window as unknown as { __floraMapInstance?: unknown }).__floraMapInstance = map.getMap();
  }, []);

  React.useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleLoaded) return;
    map.removeFeatureState({ source: SOURCE_ID });
    if (selectedFieldId) {
      map.setFeatureState({ source: SOURCE_ID, id: selectedFieldId }, { selected: true });
    }
  }, [selectedFieldId, features, styleLoaded]);

  const handleClick = React.useCallback(
    (event: MapMouseEvent) => {
      const feature = event.features?.[0];
      const id = feature?.properties?.id as string | undefined;
      onSelectField(id ?? null);
    },
    [onSelectField],
  );

  const handleDblClick = React.useCallback(
    (event: MapMouseEvent) => {
      const feature = event.features?.[0];
      const id = feature?.properties?.id as string | undefined;
      if (id) {
        event.preventDefault();
        onFieldDoubleClick?.(id);
      }
    },
    [onFieldDoubleClick],
  );

  const handleLoad = React.useCallback(() => {
    hasFittedRef.current = true;
    setStyleLoaded(true);
  }, []);

  if (!token) {
    return <MapPlaceholder />;
  }

  return (
    <MapboxMap
      ref={mapRef}
      mapboxAccessToken={token}
      mapStyle="mapbox://styles/mapbox/satellite-streets-v12"
      pitch={0}
      initialViewState={initialViewState}
      interactiveLayerIds={[FILL_LAYER_ID]}
      onClick={handleClick}
      onDblClick={handleDblClick}
      onLoad={handleLoad}
      style={{ width: "100%", height: "100%" }}
    >
      <Source id={SOURCE_ID} type="geojson" data={features} promoteId="id">
        <Layer
          id={FILL_LAYER_ID}
          type="fill"
          paint={{
            "fill-color": ["case", ["boolean", ["feature-state", "selected"], false], MAP_PRIMARY, MAP_BOUNDARY_DEFAULT],
            "fill-opacity": [
              "case",
              ["boolean", ["feature-state", "selected"], false],
              FIELD_FILL_OPACITY_SELECTED,
              FIELD_FILL_OPACITY_DEFAULT,
            ],
          }}
        />
        <Layer
          id={LINE_LAYER_ID}
          type="line"
          paint={{
            "line-color": ["case", ["boolean", ["feature-state", "selected"], false], MAP_PRIMARY, MAP_BOUNDARY_DEFAULT],
            "line-width": [
              "case",
              ["boolean", ["feature-state", "selected"], false],
              FIELD_LINE_WIDTH_SELECTED,
              FIELD_LINE_WIDTH_DEFAULT,
            ],
          }}
        />
        <FieldLabelLayer sourceId={SOURCE_ID} />
      </Source>
      {children}
    </MapboxMap>
  );
}
