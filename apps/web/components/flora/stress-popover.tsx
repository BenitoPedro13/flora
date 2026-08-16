"use client";

import * as React from "react";
import { RiCloseLine, RiLeafFill, RiRadarFill } from "@remixicon/react";
import { useMap } from "react-map-gl/mapbox";
import {
  formatAcres,
  shortZoneId,
  stressClassificationValues,
  stressClassificationLabel,
  type StressClassification,
  type StressZone,
} from "@flora/contracts";
import * as ButtonGroup from "@/components/ui/button-group";
import * as Divider from "@/components/ui/divider";
import * as Popover from "@/components/ui/popover";
import * as Select from "@/components/ui/select";

function formatShortDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

/** The exterior ring's vertex average — plenty accurate for anchoring a popover to a small field-scale polygon. */
function polygonCentroid(geometry: StressZone["geometry"]): [number, number] {
  const ring = geometry.coordinates[0] ?? [];
  const points = ring.slice(0, -1);
  const [sumLon, sumLat] = points.reduce(([lon, lat], [x, y]) => [lon + x, lat + y], [0, 0]);
  return [sumLon / points.length, sumLat / points.length];
}

export interface StressPopoverProps {
  zone: StressZone | null;
  onOpenChange: (open: boolean) => void;
  onClassify: (classification: StressClassification) => void;
  onMute: () => void;
  onDelete: () => void;
}

/**
 * `16:6309` — anchored to the selected zone's centroid, not a trigger
 * element, so its position tracks the map (TASK-crop-stress §2.8). Renders
 * as a child of `FieldMap` so it can read the live map instance via
 * `useMap()` to project the centroid to a screen point on every `move`.
 */
export function StressPopover({ zone, onOpenChange, onClassify, onMute, onDelete }: StressPopoverProps) {
  const { current: map } = useMap();
  const [point, setPoint] = React.useState<{ x: number; y: number } | null>(null);

  React.useEffect(() => {
    // No `setPoint(null)` here: `!zone` alone already suppresses rendering
    // below, so a stale `point` from a previously selected zone is harmless
    // and gets overwritten the next time a zone is selected and this effect
    // re-runs with a real map + zone.
    if (!map || !zone) return;
    const centroid = polygonCentroid(zone.geometry);
    function updatePoint() {
      const p = map!.project(centroid);
      setPoint({ x: p.x, y: p.y });
    }
    updatePoint();
    map.on("move", updatePoint);
    return () => {
      map.off("move", updatePoint);
    };
  }, [map, zone]);

  if (!zone || !point) {
    return null;
  }

  return (
    <Popover.Root open onOpenChange={(open) => !open && onOpenChange(false)}>
      <Popover.Anchor asChild>
        <div className="pointer-events-none absolute size-px" style={{ left: point.x, top: point.y }} />
      </Popover.Anchor>
      <Popover.Content className="w-[329px] !p-4" side="top">
        <div className="flex items-start justify-between">
          <h3 className="text-label-md text-text-strong-950">Stress detected</h3>
          <Popover.Close aria-label="Close" className="!static text-text-soft-400 hover:text-text-strong-950">
            <RiCloseLine className="size-5" />
          </Popover.Close>
        </div>
        <p className="mt-1 text-paragraph-xs text-text-soft-400">{shortZoneId(zone.id)}</p>

        <div className="mt-3 flex items-center gap-1.5 text-paragraph-sm text-text-sub-600">
          <RiRadarFill className="size-4 shrink-0" />
          <span>Identified:</span>
          <span className="text-text-strong-950">
            {formatShortDate(zone.windowStart)} – {formatShortDate(zone.windowEnd)}
          </span>
        </div>

        <Divider.Root className="my-3" />

        <div className="flex items-center justify-between text-paragraph-xs text-text-sub-600">
          <span>{formatShortDate(zone.detectedOn)}</span>
          <span>{formatAcres(zone.areaM2)}</span>
          <span className="flex items-center gap-1">
            <RiLeafFill className="size-4 text-text-sub-600" />
            NDVI:
            <span className="text-error-base">{zone.indexValue.toFixed(2)}</span>
          </span>
        </div>

        <div className="mt-3">
          <Select.Root variant="compact" value={zone.classification} onValueChange={(v) => onClassify(v as StressClassification)}>
            <Select.Trigger aria-label="Classification" className="h-[52px] w-full">
              <Select.Value>{stressClassificationLabel(zone.classification)}</Select.Value>
            </Select.Trigger>
            <Select.Content>
              {stressClassificationValues.map((value) => (
                <Select.Item key={value} value={value}>
                  {stressClassificationLabel(value)}
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Root>
        </div>

        <ButtonGroup.Root size="small" className="mt-3 w-full [&>button]:flex-1">
          <ButtonGroup.Item onClick={onMute}>{zone.mutedAt !== null ? "Unmute" : "Mute"}</ButtonGroup.Item>
          <ButtonGroup.Item onClick={onDelete}>Delete</ButtonGroup.Item>
        </ButtonGroup.Root>
      </Popover.Content>
    </Popover.Root>
  );
}
