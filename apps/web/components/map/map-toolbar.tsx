"use client";

import * as React from "react";
import length from "@turf/length";
import { RiAddLine, RiCrosshairFill, RiRulerFill, RiSubtractFill } from "@remixicon/react";
import { Layer, Source, useMap } from "react-map-gl/mapbox";
import * as CompactButton from "@/components/ui/compact-button";
import * as Divider from "@/components/ui/divider";
import * as Tooltip from "@/components/ui/tooltip";
import { cn } from "@/utils/cn";
import { MAP_PRIMARY } from "./config";

const MEASURE_SOURCE_ID = "measure-line";
const MEASURE_LAYER_ID = "measure-line-layer";

export interface MapToolbarProps {
  /** The selected field's bounds — locate flies here (§7 decision, design-spec §8's 400ms). */
  bounds: [[number, number], [number, number]];
}

/**
 * The three floating control groups (`18:6059`/`18:6044`/`18:6032`,
 * TASK-crop-stress §2.6): locate, measure, zoom. Positioned map-relative —
 * the map's own container is the nearest `position: relative` ancestor
 * (`@vis.gl/react-mapbox`'s `<Map>` sets it), so absolute offsets here read
 * against the map viewport, not the page.
 */
export function MapToolbar({ bounds }: MapToolbarProps) {
  const { current: map } = useMap();
  const [measuring, setMeasuring] = React.useState(false);
  const [points, setPoints] = React.useState<[number, number][]>([]);
  const [distanceKm, setDistanceKm] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (!map || !measuring) return;
    const raw = map.getMap();
    function handleClick(e: { lngLat: { lng: number; lat: number } }) {
      setPoints((prev) => {
        const next: [number, number][] = prev.length >= 2 ? [[e.lngLat.lng, e.lngLat.lat]] : [...prev, [e.lngLat.lng, e.lngLat.lat]];
        if (next.length === 2) {
          const line = { type: "LineString" as const, coordinates: next };
          setDistanceKm(length({ type: "Feature", properties: {}, geometry: line }, { units: "kilometers" }));
        } else {
          setDistanceKm(null);
        }
        return next;
      });
    }
    raw.on("click", handleClick);
    raw.getCanvas().style.cursor = "crosshair";
    return () => {
      raw.off("click", handleClick);
      raw.getCanvas().style.cursor = "";
    };
  }, [map, measuring]);

  function toggleMeasure() {
    setMeasuring((m) => !m);
    setPoints([]);
    setDistanceKm(null);
  }

  function handleLocate() {
    map?.fitBounds(bounds, { padding: 48, duration: 400 });
  }

  const lineData = React.useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: points.length === 2 ? [{ type: "Feature" as const, properties: {}, geometry: { type: "LineString" as const, coordinates: points } }] : [],
    }),
    [points],
  );

  return (
    <>
      {points.length === 2 ? (
        <Source id={MEASURE_SOURCE_ID} type="geojson" data={lineData}>
          <Layer id={MEASURE_LAYER_ID} type="line" paint={{ "line-color": MAP_PRIMARY, "line-width": 2, "line-dasharray": [2, 1] }} />
        </Source>
      ) : null}

      <Tooltip.Provider>
        <Tooltip.Root delayDuration={300}>
          <Tooltip.Trigger asChild>
            <CompactButton.Root
              variant="white"
              fullRadius
              className="absolute left-[35px] top-[22px] size-10 shadow-regular-sm [&_svg]:size-5"
              onClick={handleLocate}
              aria-label="Locate field"
            >
              <CompactButton.Icon as={RiCrosshairFill} />
            </CompactButton.Root>
          </Tooltip.Trigger>
          <Tooltip.Content side="right">Locate field</Tooltip.Content>
        </Tooltip.Root>

        <Tooltip.Root delayDuration={300}>
          <Tooltip.Trigger asChild>
            <CompactButton.Root
              variant="white"
              fullRadius
              className={cn(
                "absolute left-[34px] top-[73px] size-10 shadow-regular-sm [&_svg]:size-5",
                measuring && "bg-primary-base text-static-white hover:bg-primary-darker hover:text-static-white",
              )}
              onClick={toggleMeasure}
              aria-label="Measure distance"
              aria-pressed={measuring}
            >
              <CompactButton.Icon as={RiRulerFill} />
            </CompactButton.Root>
          </Tooltip.Trigger>
          <Tooltip.Content side="right">
            {measuring ? (distanceKm != null ? `${distanceKm.toFixed(2)} km` : "Click two points") : "Measure distance"}
          </Tooltip.Content>
        </Tooltip.Root>

        <div className="absolute left-[35px] top-[124px] flex h-20 w-10 flex-col overflow-hidden rounded-full bg-bg-white-0 shadow-regular-sm">
          <button
            type="button"
            aria-label="Zoom in"
            onClick={() => map?.zoomIn({ duration: 200 })}
            className="flex h-10 w-10 items-center justify-center text-text-sub-600 transition hover:bg-bg-weak-50 hover:text-text-strong-950"
          >
            <RiAddLine className="size-5" />
          </button>
          <Divider.Root />
          <button
            type="button"
            aria-label="Zoom out"
            onClick={() => map?.zoomOut({ duration: 200 })}
            className="flex h-10 w-10 items-center justify-center text-text-sub-600 transition hover:bg-bg-weak-50 hover:text-text-strong-950"
          >
            <RiSubtractFill className="size-5" />
          </button>
        </div>
      </Tooltip.Provider>
    </>
  );
}
