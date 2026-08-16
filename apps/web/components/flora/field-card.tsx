import { RiLayout2Line, RiLeafLine, RiPlantFill, RiSeedlingLine, RiTreeLine } from "@remixicon/react";
import type { FieldSummary, Point } from "@flora/contracts";
import { formatTonnes } from "@flora/contracts";
import * as Divider from "@/components/ui/divider";
import * as ProgressBar from "@/components/ui/progress-bar";
import { cn } from "@/utils/cn";
import { ActivityTag } from "./activity-tag";

function formatCentroid(centroid: Point): string {
  const [lon, lat] = centroid.coordinates;
  const latDir = lat >= 0 ? "N" : "S";
  const lonDir = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(4)}° ${latDir} / ${Math.abs(lon).toFixed(4)}° ${lonDir}`;
}

function MetricCell({
  icon: Icon,
  label,
  value,
  title,
}: {
  icon: typeof RiTreeLine;
  label: string;
  value: string;
  title?: string;
}) {
  return (
    <div className="flex w-[123px] flex-col gap-1" title={title}>
      <div className="flex items-center gap-1">
        <Icon className="size-[18px] text-text-sub-600" />
        <span className="text-label-xs text-text-sub-600">{label}</span>
      </div>
      <span className="text-label-md text-text-strong-950">{value}</span>
    </div>
  );
}

export interface FieldCardProps {
  field: FieldSummary;
  selected: boolean;
  onSelect: () => void;
  onViewDetails: () => void;
  /** Double-clicking the card opens the editor (TASK-crop-stress §2.12) — View Details now navigates to Crop Stress, so the editor needs a second entry point, mirroring the map polygon's own double-click gesture. */
  onDoubleClick?: () => void;
}

/**
 * The field card (design-spec §5.2, `get_design_context` on
 * `2158:18884`/`19459`/`19362`/`19539` — TASK-fields §2.7): title, activity
 * tags, a growth row over a full-width progress bar, the 2×2 metric grid
 * (D15: Soil Moisture / Carbon Ton Potential render `—`, no data source),
 * and a footer with the centroid and View Details. Selected = a
 * `success-base` ring (the Figma's per-card border, not `primary-base` —
 * confirmed on `2158:19362`, Field 239's selected state).
 */
export function FieldCard({ field, selected, onSelect, onViewDetails, onDoubleClick }: FieldCardProps) {
  const cycle = field.cropCycle;

  return (
    // Plain click-to-select, not an ARIA `role="button"` — this card
    // contains a real `<button>` (View Details), and a focusable/announced
    // button nested inside another button-role element is an accessibility
    // anti-pattern (confusing Tab order, invalid nested-control semantics).
    // View Details stays the one keyboard-operable control per card;
    // clicking elsewhere on the card is a mouse-only convenience mirroring
    // the map's click-to-select.
    <div
      data-testid={`field-card-${field.name}`}
      className={cn(
        "flex flex-col gap-4 rounded-2xl border bg-bg-white-0 p-6",
        selected ? "border-success-base" : "border-stroke-soft-200",
      )}
      onClick={onSelect}
      onDoubleClick={onDoubleClick}
    >
      <div className="flex flex-col gap-2">
        <h3 className="truncate text-title-h5 text-text-strong-950">{field.name}</h3>
        <div className="flex flex-wrap gap-1">
          {field.activities.map((activity) => (
            <ActivityTag key={activity} activity={activity} />
          ))}
        </div>
      </div>

      <Divider.Root />

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <RiPlantFill className="size-[18px] text-text-sub-600" />
            <span className="text-label-xs text-text-sub-600">Growth</span>
          </div>
          <span className="text-label-xs text-text-sub-600">{cycle ? `${cycle.growthPct}%` : "—"}</span>
        </div>
        <ProgressBar.Root value={cycle?.growthPct ?? 0} color="green" />
      </div>

      <Divider.Root />

      <div className="flex flex-wrap gap-4">
        <MetricCell icon={RiTreeLine} label="Specie Planted" value={cycle?.cropName ?? "—"} />
        <MetricCell
          icon={RiLayout2Line}
          label="Crops Quantity"
          value={cycle?.quantityKg != null ? formatTonnes(cycle.quantityKg) : "—"}
        />
        <MetricCell icon={RiSeedlingLine} label="Soil Moisture" value="—" title="No data source yet" />
        <MetricCell icon={RiLeafLine} label="Carbon Ton Potential" value="—" title="No data source yet" />
      </div>

      <Divider.Root />

      <div className="flex items-center justify-between gap-3">
        <span className="truncate text-paragraph-xs text-text-sub-600">{formatCentroid(field.centroid)}</span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onViewDetails();
          }}
          className={cn(
            "shadow-fancy-buttons-primary inline-flex h-8 shrink-0 items-center justify-center rounded-lg bg-primary-base px-3 text-label-sm text-static-white",
            "transition duration-200 ease-out hover:bg-primary-darker",
          )}
        >
          View Details
        </button>
      </div>
    </div>
  );
}

export { formatCentroid };
