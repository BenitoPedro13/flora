import { RiNotificationOffFill, RiPlantFill } from "@remixicon/react";
import { formatAcres, stressClassificationValues, stressClassificationLabel, type StressClassification, type StressZone } from "@flora/contracts";
import * as Badge from "@/components/ui/badge";
import * as Select from "@/components/ui/select";
import { cn } from "@/utils/cn";

function formatShortDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

export interface StressZoneRowProps {
  zone: StressZone;
  selected: boolean;
  hovered: boolean;
  isFirst: boolean;
  onSelect: () => void;
  onHover: (hovered: boolean) => void;
  onClassify: (classification: StressClassification) => void;
  onToggleMute: () => void;
}

/**
 * `18:7054` — a 60px row (the first is 72, a lead-in not a different row,
 * TASK-crop-stress §2.8). Clicking selects the zone (map flies + popover
 * opens); the classification `Select` here is the same control the popover
 * carries, so changing it here and there both move the row between groups.
 */
export function StressZoneRow({ zone, selected, hovered, isFirst, onSelect, onHover, onClassify, onToggleMute }: StressZoneRowProps) {
  const muted = zone.mutedAt !== null;

  return (
    <div
      data-testid={`stress-zone-row-${zone.id}`}
      className={cn(
        "flex h-[60px] shrink-0 items-center gap-3 border-b border-stroke-soft-200 px-4",
        isFirst && "pt-3",
        (selected || hovered) && "bg-bg-weak-50",
        muted && "opacity-60",
      )}
      onClick={onSelect}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
    >
      <RiPlantFill className="size-8 shrink-0 text-text-sub-600" />

      <div className="flex w-[147px] shrink-0 flex-col gap-1">
        <div onClick={(e) => e.stopPropagation()}>
          <Select.Root variant="compact" value={zone.classification} onValueChange={(v) => onClassify(v as StressClassification)}>
            <Select.Trigger aria-label="Classification" className="h-6 w-[92px]">
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
        <span className="truncate text-paragraph-xs text-text-sub-600">
          {formatShortDate(zone.windowStart)} – {formatShortDate(zone.windowEnd)} ({formatAcres(zone.areaM2)})
        </span>
      </div>

      <div className="flex flex-1 items-center justify-end gap-2">
        {zone.isNew ? (
          <Badge.Root variant="light" color="blue" size="medium">
            NEW
          </Badge.Root>
        ) : null}
        <button
          type="button"
          aria-label={muted ? "Unmute detection" : "Mute detection"}
          aria-pressed={muted}
          onClick={(e) => {
            e.stopPropagation();
            onToggleMute();
          }}
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-lg text-text-sub-600 transition hover:bg-bg-weak-100 hover:text-text-strong-950",
            muted && "text-primary-base",
          )}
        >
          <RiNotificationOffFill className="size-5" />
        </button>
      </div>
    </div>
  );
}
