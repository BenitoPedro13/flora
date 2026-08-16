"use client";

import * as React from "react";
import MapboxDraw from "@mapbox/mapbox-gl-draw";
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css";
import area from "@turf/area";
import type { Feature, Polygon } from "geojson";
import type { MultiPolygon } from "@flora/contracts";
import { useControl } from "react-map-gl/mapbox";

/**
 * `mapbox-gl-draw` behind `useControl` — react-map-gl's supported escape
 * hatch for an imperative control in a declarative tree (TASK-fields §8's
 * risk log: wrapping this way, rather than calling `map.addControl`
 * ourselves in an effect, is what keeps a client navigation from leaving a
 * duplicate toolbar under React 19 / Next 16 dev StrictMode).
 *
 * The draw instance and its change handler live in refs, written only
 * inside `useControl`'s own callbacks (never during render) and read the
 * same way — the `react-hooks` plugin's newer rules reject both mutating a
 * ref during render and a callback closing over a value declared by the
 * same hook call it's passed into, so this can't just do
 * `const draw = useControl(onCreate, onAdd, ...)` and close over `draw`
 * inside `onAdd`.
 */
export interface DrawControlProps {
  /** A drawn `Polygon` is wrapped to one part — the editor only ever deals in `MultiPolygon`. */
  onChange: (boundary: MultiPolygon | null, areaM2: number | null) => void;
  /** Preloaded once, on mount, for the "edit an existing boundary" path (double-click a polygon, or View Details). */
  initialBoundary?: MultiPolygon | null;
}

function toMultiPolygon(features: Feature[]): { boundary: MultiPolygon; areaM2: number } | null {
  const polygons = features.filter((f): f is Feature<Polygon> => f.geometry.type === "Polygon");
  if (polygons.length === 0) {
    return null;
  }
  const boundary: MultiPolygon = {
    type: "MultiPolygon",
    coordinates: polygons.map((f) => f.geometry.coordinates as MultiPolygon["coordinates"][number]),
  };
  const areaM2 = polygons.reduce((sum, f) => sum + area(f), 0);
  return { boundary, areaM2 };
}

export function DrawControl({ onChange, initialBoundary }: DrawControlProps) {
  const onChangeRef = React.useRef(onChange);
  React.useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const drawRef = React.useRef<MapboxDraw | null>(null);
  const listenerRef = React.useRef<(() => void) | null>(null);

  useControl<MapboxDraw>(
    () => {
      const instance = new MapboxDraw({
        displayControlsDefault: false,
        controls: { polygon: true, trash: true },
        defaultMode: initialBoundary ? "simple_select" : "draw_polygon",
      });
      drawRef.current = instance;
      return instance;
    },
    ({ map }) => {
      const instance = drawRef.current;
      if (!instance) return;
      if (initialBoundary) {
        // `draw.add()` throws "Style is not done loading" if the map's
        // style isn't ready yet — onAdd fires as soon as the control is
        // attached, which can be before that (verified live: opening the
        // editor on a fresh map threw this as an uncaught error).
        const addInitialBoundary = () => {
          instance.add(initialBoundary);
          const result = toMultiPolygon(instance.getAll().features);
          onChangeRef.current(result?.boundary ?? null, result?.areaM2 ?? null);
        };
        if (map.isStyleLoaded()) {
          addInitialBoundary();
        } else {
          map.once("load", addInitialBoundary);
        }
      }
      const handleChange = () => {
        const result = toMultiPolygon(instance.getAll().features);
        onChangeRef.current(result?.boundary ?? null, result?.areaM2 ?? null);
      };
      listenerRef.current = handleChange;
      map.on("draw.create", handleChange);
      map.on("draw.update", handleChange);
      map.on("draw.delete", handleChange);
    },
    ({ map }) => {
      const handleChange = listenerRef.current;
      if (handleChange) {
        map.off("draw.create", handleChange);
        map.off("draw.update", handleChange);
        map.off("draw.delete", handleChange);
      }
    },
    { position: "top-left" },
  );

  return null;
}

export type { MapboxDraw };
