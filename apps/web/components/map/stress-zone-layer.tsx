"use client";

import * as React from "react";
import type { MapLayerMouseEvent } from "mapbox-gl";
import { Layer, Source, useMap } from "react-map-gl/mapbox";
import type { StressZone } from "@flora/contracts";
import {
  STRESS_ZONE_FILL_OPACITY_DEFAULT,
  STRESS_ZONE_FILL_OPACITY_HOVERED,
  STRESS_ZONE_FILL_OPACITY_SELECTED,
  STRESS_ZONE_LINE_DEFAULT,
  STRESS_ZONE_LINE_SELECTED,
  STRESS_ZONE_LINE_WIDTH_DEFAULT,
  STRESS_ZONE_LINE_WIDTH_SELECTED,
  STRESS_ZONE_OPACITY_MUTED,
} from "./config";

const SOURCE_ID = "stress-zones";
const FILL_LAYER_ID = "stress-zones-fill";
const LINE_LAYER_ID = "stress-zones-line";

export interface StressZoneLayerProps {
  zones: StressZone[];
  selectedZoneId: string | null;
  hoveredZoneId: string | null;
  onSelectZone: (id: string) => void;
  onHoverZone: (id: string | null) => void;
  /** Muted zones stay in the source (so unmuting doesn't need a remount) but render dimmed only once this is true; hidden entirely otherwise. */
  showMuted: boolean;
}

/**
 * A field's stress zones as a client-built GeoJSON source — `geometry` is
 * already on every `StressZone` the panel fetched, so this needs no second
 * endpoint (TASK-crop-stress §2.6). Selection and hover both live in
 * `feature-state`, driven by props rather than internal state, so a panel
 * row's hover and a map hover are the same state, not two.
 */
export function StressZoneLayer({
  zones,
  selectedZoneId,
  hoveredZoneId,
  onSelectZone,
  onHoverZone,
  showMuted,
}: StressZoneLayerProps) {
  const { current: map } = useMap();
  const [styleLoaded, setStyleLoaded] = React.useState(() => map?.isStyleLoaded() ?? false);

  const data = React.useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: zones
        .filter((zone) => showMuted || zone.mutedAt === null)
        .map((zone) => ({
          type: "Feature" as const,
          geometry: zone.geometry,
          properties: { id: zone.id, muted: zone.mutedAt !== null },
        })),
    }),
    [zones, showMuted],
  );

  React.useEffect(() => {
    // No direct `setStyleLoaded` call here — only the lazy initializer above
    // and this genuine event callback set it, per the "subscribe, then
    // setState in the callback" pattern.
    if (!map) return;
    const onStyleData = () => setStyleLoaded(map.isStyleLoaded());
    map.on("styledata", onStyleData);
    return () => {
      map.off("styledata", onStyleData);
    };
  }, [map]);

  React.useEffect(() => {
    if (!map || !styleLoaded || !map.getSource(SOURCE_ID)) return;
    map.removeFeatureState({ source: SOURCE_ID });
    if (selectedZoneId) {
      map.setFeatureState({ source: SOURCE_ID, id: selectedZoneId }, { selected: true });
    }
    if (hoveredZoneId) {
      map.setFeatureState({ source: SOURCE_ID, id: hoveredZoneId }, { hovered: true });
    }
  }, [map, selectedZoneId, hoveredZoneId, styleLoaded, data]);

  React.useEffect(() => {
    if (!map) return;
    const raw = map.getMap();

    function handleClick(e: MapLayerMouseEvent) {
      const id = e.features?.[0]?.properties?.id as string | undefined;
      if (id) onSelectZone(id);
    }
    function handleMouseEnter(e: MapLayerMouseEvent) {
      raw.getCanvas().style.cursor = "pointer";
      const id = e.features?.[0]?.properties?.id as string | undefined;
      onHoverZone(id ?? null);
    }
    function handleMouseLeave() {
      raw.getCanvas().style.cursor = "";
      onHoverZone(null);
    }

    raw.on("click", FILL_LAYER_ID, handleClick);
    raw.on("mousemove", FILL_LAYER_ID, handleMouseEnter);
    raw.on("mouseleave", FILL_LAYER_ID, handleMouseLeave);
    return () => {
      raw.off("click", FILL_LAYER_ID, handleClick);
      raw.off("mousemove", FILL_LAYER_ID, handleMouseEnter);
      raw.off("mouseleave", FILL_LAYER_ID, handleMouseLeave);
    };
  }, [map, onSelectZone, onHoverZone]);

  return (
    <Source id={SOURCE_ID} type="geojson" data={data} promoteId="id">
      <Layer
        id={FILL_LAYER_ID}
        type="fill"
        paint={{
          "fill-color": ["case", ["boolean", ["feature-state", "selected"], false], STRESS_ZONE_LINE_SELECTED, STRESS_ZONE_LINE_DEFAULT],
          "fill-opacity": [
            "*",
            [
              "case",
              ["boolean", ["feature-state", "selected"], false],
              STRESS_ZONE_FILL_OPACITY_SELECTED,
              ["boolean", ["feature-state", "hovered"], false],
              STRESS_ZONE_FILL_OPACITY_HOVERED,
              STRESS_ZONE_FILL_OPACITY_DEFAULT,
            ],
            ["case", ["boolean", ["get", "muted"], false], STRESS_ZONE_OPACITY_MUTED, 1],
          ],
        }}
      />
      <Layer
        id={LINE_LAYER_ID}
        type="line"
        paint={{
          "line-color": ["case", ["boolean", ["feature-state", "selected"], false], STRESS_ZONE_LINE_SELECTED, STRESS_ZONE_LINE_DEFAULT],
          "line-width": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            STRESS_ZONE_LINE_WIDTH_SELECTED,
            STRESS_ZONE_LINE_WIDTH_DEFAULT,
          ],
          "line-opacity": ["case", ["boolean", ["get", "muted"], false], STRESS_ZONE_OPACITY_MUTED, 1],
        }}
      />
    </Source>
  );
}
