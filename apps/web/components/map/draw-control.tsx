"use client";

import * as React from "react";
import MapboxDraw from "@mapbox/mapbox-gl-draw";
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css";
import area from "@turf/area";
import type { Feature, Polygon } from "geojson";
import type { MultiPolygon } from "@flora/contracts";
import type { MapRef } from "react-map-gl/mapbox";

/**
 * `mapbox-gl-draw`, added to the map imperatively in a single `useEffect`.
 *
 * This is **not** react-map-gl's `useControl` hook, on purpose — a first
 * version used it with the control instance stashed in a ref from
 * `useControl`'s `onCreate` (a `useMemo` initializer). React 19 dev
 * StrictMode double-invokes `useMemo` initializers, and writing to a ref
 * from inside one is exactly the impure-during-render pattern React's own
 * docs warn about: the ref could end up holding a *different* `MapboxDraw`
 * instance than the one `useControl` actually passed to
 * `map.addControl()`, so `.add()` failed reading `ctx.store` on an instance
 * that was never wired up — reproduced live (`Cannot read properties of
 * undefined (reading 'get')` inside mapbox-gl-draw's own `api.add()`,
 * `ctx.store.get(...)`) once a real Mapbox token let the map actually
 * finish loading — a placeholder token had silently masked this whole path
 * during earlier testing. A plain effect creates one instance, uses that
 * same local `const` for everything, and cleans it up on unmount — no
 * separate hook-call boundaries for the instance to go stale across.
 */
export interface DrawControlProps {
  /** The loaded map to attach to — pass this only once `onLoad` has fired; mapbox-gl-draw needs the style ready (§ below). */
  map: MapRef;
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

export function DrawControl({ map, onChange, initialBoundary }: DrawControlProps) {
  const onChangeRef = React.useRef(onChange);
  React.useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // `initialBoundary` is only ever read on the effect's first run (a fresh
  // `DrawControl` mount per editor open, TASK-fields §10) — not a dep, so a
  // parent re-render with a new-but-equivalent boundary object doesn't tear
  // the control down and re-add the farmer's in-progress edit.
  const initialBoundaryRef = React.useRef(initialBoundary);

  React.useEffect(() => {
    const instance = new MapboxDraw({
      displayControlsDefault: false,
      controls: { polygon: true, trash: true },
      defaultMode: initialBoundaryRef.current ? "simple_select" : "draw_polygon",
    });

    map.addControl(instance, "top-left");

    const emitChange = () => {
      const result = toMultiPolygon(instance.getAll().features);
      onChangeRef.current(result?.boundary ?? null, result?.areaM2 ?? null);
    };

    const boundary = initialBoundaryRef.current;
    if (boundary) {
      const addInitialBoundary = () => {
        instance.add(boundary);
        emitChange();
      };
      if (map.isStyleLoaded()) {
        addInitialBoundary();
      } else {
        map.once("load", addInitialBoundary);
      }
    }

    map.on("draw.create", emitChange);
    map.on("draw.update", emitChange);
    map.on("draw.delete", emitChange);

    return () => {
      map.off("draw.create", emitChange);
      map.off("draw.update", emitChange);
      map.off("draw.delete", emitChange);
      if (map.hasControl(instance)) {
        map.removeControl(instance);
      }
    };
  }, [map]);

  return null;
}

export type { MapboxDraw };
