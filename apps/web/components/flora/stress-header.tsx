"use client";

import * as React from "react";
import { RiCalendarLine, RiInformationLine, RiLandscapeLine, RiRadarFill } from "@remixicon/react";
import type { Field, FieldSummary, ObservationIndex } from "@flora/contracts";
import * as Badge from "@/components/ui/badge";
import { Calendar } from "@/components/ui/datepicker";
import * as Popover from "@/components/ui/popover";
import * as Select from "@/components/ui/select";
import * as Tooltip from "@/components/ui/tooltip";
import { IconTile } from "@/components/flora/icon-tile";
import { PageHeader } from "@/components/flora/page-header";

/**
 * The competitor reference menu (`TASK-spectral-indices`, header note) lists
 * eleven layers; only ten map to something Flora can render (§1.4). The
 * label here is what the menu shows, not necessarily the enum value's name —
 * `ndvi` is labelled **"Contrasted NDVI"** because that's honestly what the
 * stored raster is (`rampDomain`'s p10→p90 stretch, finding #3): the
 * fixed-domain "plain NDVI" the reference also lists needs a client-side
 * colour-mapped raster this task doesn't build (§7 decision 1's recorded
 * deviation — see the task doc §10). `pri_proxy` is labelled "PRI (proxy)",
 * never bare "PRI" (§7 decision 4) — a user must never mistake it for the
 * real thing. `vsdi` is labelled "SMI", matching the reference menu's name
 * for the slot it fills (§7 decision 5).
 */
const INDEX_LABELS: Record<ObservationIndex, string> = {
  ndvi: "Contrasted NDVI",
  ndre: "NDRE",
  ndwi: "NDWI",
  evi: "EVI",
  ndmi: "NDMI",
  msavi: "MSAVI",
  reci: "RECI",
  mcari: "MCARI",
  pri_proxy: "PRI (proxy)",
  vsdi: "SMI",
  true_color: "Satellite Image",
};

/**
 * One sentence per index: what it measures, what high/low means. Sourced,
 * not written from memory (§2.6) — citations match the ones already in
 * `packages/satellite/src/cdse/evalscript.ts` and the task doc's §7.
 */
const INDEX_DESCRIPTIONS: Record<ObservationIndex, string> = {
  ndvi:
    "Normalized Difference Vegetation Index, stretched to this scene's own 10th-90th percentile range so variation within the field stands out. Higher is healthier, denser canopy.",
  ndre:
    "Normalized Difference Red Edge — like NDVI but sensitive to chlorophyll in denser canopy, where NDVI saturates. Higher is healthier.",
  ndwi:
    "McFeeters' surface-water index, from green and near-infrared reflectance. High values mean standing water or saturated soil, not vegetation health.",
  evi: "Enhanced Vegetation Index — corrects NDVI for canopy background and atmospheric noise. Higher is healthier.",
  ndmi:
    "Normalized Difference Moisture Index — canopy water content from near-infrared and short-wave-infrared reflectance. Higher means more moisture.",
  msavi:
    "MSAVI2 (Qi et al. 1994) — a self-adjusting vegetation index that corrects for bare-soil background, useful on sparse or early-season canopy. Higher is healthier.",
  reci:
    "Red-edge chlorophyll index (Gitelson et al.) — canopy chlorophyll content from the near-infrared/red-edge ratio. Higher generally means more chlorophyll.",
  mcari:
    "Modified Chlorophyll Absorption Ratio Index (Daughtry et al. 2000) — chlorophyll absorption relative to background reflectance.",
  pri_proxy:
    "Substitutes Sentinel-2's blue and green bands for the 531/570nm reflectance true PRI needs, which this satellite doesn't carry — a published approximation, not true Photochemical Reflectance Index. Read it as directional, not exact.",
  vsdi:
    "Shown here as soil moisture: the Visible and Shortwave-infrared Drought Index (Zhang et al. 2013), a published soil-and-vegetation moisture index from blue, red and shortwave-infrared reflectance. Higher means more moisture.",
  true_color: "A true-colour photo of the field on this date.",
};

interface IndexOption {
  index: ObservationIndex;
  available: true;
}
interface UnavailableOption {
  key: string;
  label: string;
  reason: string;
  available: false;
}
type MenuOption = IndexOption | UnavailableOption;

interface MenuGroup {
  label: string;
  options: MenuOption[];
}

/**
 * `TASK-spectral-indices` §2.6's grouping, extended to place every shipped
 * index somewhere (the task doc's own group list omitted PRI/SMI and didn't
 * mention EVI, a pre-existing index outside the reference menu — both
 * folded in here rather than left unreachable). "Satellite Image" got its
 * real 3-band pipeline as a same-day follow-on (§1.4) and is a working
 * entry. "Plain NDVI" (the fixed-domain variant) is the one still disabled,
 * with a tooltip — it needs a client-side colour-mapped raster this task
 * doesn't build (§7 decision 1's recorded deviation), the same treatment
 * the three greyed-out reference items get for having no data source at all.
 */
const MENU_GROUPS: MenuGroup[] = [
  {
    label: "Vegetation",
    options: [
      { index: "ndvi", available: true },
      {
        key: "ndvi_fixed",
        label: "NDVI",
        reason: "Needs a client-side colour-mapped raster this task doesn't build yet — see TASK-spectral-indices §7 decision 1.",
        available: false,
      },
      { index: "ndre", available: true },
      { index: "evi", available: true },
      { index: "msavi", available: true },
      { index: "reci", available: true },
      { index: "mcari", available: true },
      { index: "pri_proxy", available: true },
    ],
  },
  {
    label: "Water & moisture",
    options: [
      { index: "ndmi", available: true },
      { index: "ndwi", available: true },
      { index: "vsdi", available: true },
    ],
  },
  {
    label: "Imagery",
    options: [{ index: "true_color", available: true }],
  },
  {
    label: "Not available",
    options: [
      { key: "productivity_map", label: "Productivity map", reason: "Out of scope — no data source yet.", available: false },
      { key: "soil_brightness", label: "Soil brightness", reason: "Out of scope — no data source yet.", available: false },
      { key: "elevation", label: "Elevation", reason: "Needs a DEM data source, not Sentinel-2 imagery.", available: false },
    ],
  },
];

function formatBadgeDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export interface StressHeaderProps {
  fields: FieldSummary[];
  currentField: Field;
  onFieldChange: (fieldId: string) => void;
  dates: string[];
  selectedDate: string | undefined;
  onDateChange: (date: string) => void;
  index: ObservationIndex;
  onIndexChange: (index: ObservationIndex) => void;
}

/** Stops the info-icon's hover from also firing the enclosing `Select.Item`'s pointer-driven selection. */
function stopSelectItemPointer(e: React.SyntheticEvent) {
  e.stopPropagation();
}

function IndexInfoIcon({ index }: { index: ObservationIndex }) {
  return (
    <Tooltip.Root delayDuration={200}>
      <Tooltip.Trigger asChild>
        <span
          className="inline-flex shrink-0 text-text-soft-400 hover:text-text-sub-600"
          onPointerDown={stopSelectItemPointer}
          onClick={stopSelectItemPointer}
        >
          <RiInformationLine className="size-3.5" />
        </span>
      </Tooltip.Trigger>
      <Tooltip.Content side="right" className="max-w-[240px]">
        {INDEX_DESCRIPTIONS[index]}
      </Tooltip.Content>
    </Tooltip.Root>
  );
}

/** A disabled `Select.Item`, wrapped in a plain `div` so the tooltip still gets pointer events — the item itself is `pointer-events-none` once disabled (`ColorRampLegend`'s pre-existing pattern for the same problem). */
function UnavailableMenuItem({ option }: { option: UnavailableOption }) {
  return (
    <Tooltip.Root delayDuration={200}>
      <Tooltip.Trigger asChild>
        <div>
          <Select.Item value={option.key} disabled>
            {option.label}
          </Select.Item>
        </div>
      </Tooltip.Trigger>
      <Tooltip.Content side="right" className="max-w-[240px]">
        {option.reason}
      </Tooltip.Content>
    </Tooltip.Root>
  );
}

/**
 * `2171:9757` (the field-switcher `PageHeader`) plus `18:7017` ("Crop
 * Stress" + the Date: row) and NFR-8's stale badge (TASK-crop-stress §2.7,
 * §2.11), now with the grouped index switcher `TASK-spectral-indices` §2.6
 * added — grouped per §4's affected-files table. No artboard exists for the
 * switcher (§9): built from AlignUI primitives, Flora's own light theme, not
 * pixel-matched to the competitor reference screenshot.
 */
export function StressHeader({
  fields,
  currentField,
  onFieldChange,
  dates,
  selectedDate,
  onDateChange,
  index,
  onIndexChange,
}: StressHeaderProps) {
  const [calendarOpen, setCalendarOpen] = React.useState(false);
  const dateSet = React.useMemo(() => new Set(dates), [dates]);
  const isStale = currentField.lastRefreshError !== null;

  return (
    <>
      <PageHeader
        leading={
          <IconTile size="40" tone="primary">
            <RiLandscapeLine className="size-5" />
          </IconTile>
        }
        title="Fields"
        actions={
          <Select.Root variant="compact" value={currentField.id} onValueChange={onFieldChange}>
            <Select.Trigger aria-label="Select field" className="w-[160px]">
              <Select.Value>{fields.find((f) => f.id === currentField.id)?.name ?? "Select field"}</Select.Value>
            </Select.Trigger>
            <Select.Content>
              {fields.map((field) => (
                <Select.Item key={field.id} value={field.id}>
                  {field.name}
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Root>
        }
      />

      <div className="flex flex-col gap-3 px-8 py-[29px]">
        <div className="flex items-center gap-2">
          <h2 className="text-title-h4 text-text-strong-950">Crop Stress</h2>
          {isStale && currentField.lastRefreshSucceededAt ? (
            <Tooltip.Root delayDuration={200}>
              <Tooltip.Trigger asChild>
                <span>
                  <Badge.Root variant="light" color="orange" size="medium">
                    Stale · last updated {formatBadgeDate(currentField.lastRefreshSucceededAt)}
                  </Badge.Root>
                </span>
              </Tooltip.Trigger>
              <Tooltip.Content side="bottom">{currentField.lastRefreshError}</Tooltip.Content>
            </Tooltip.Root>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <RiRadarFill className="size-8 shrink-0 text-text-sub-600" />
          <span className="text-label-sm text-text-sub-600">Date:</span>

          <Popover.Root open={calendarOpen} onOpenChange={setCalendarOpen}>
            <Popover.Trigger asChild>
              <button
                type="button"
                className="flex h-10 w-[107px] items-center gap-1.5 rounded-lg border border-stroke-soft-200 px-2.5 text-label-sm text-text-strong-950 shadow-regular-xs transition hover:bg-bg-weak-50"
              >
                <RiCalendarLine className="size-4 shrink-0 text-text-sub-600" />
                <span className="truncate">{selectedDate ? formatBadgeDate(selectedDate) : "—"}</span>
              </button>
            </Popover.Trigger>
            <Popover.Content align="start" showArrow={false} className="!p-0">
              <Calendar
                mode="single"
                selected={selectedDate ? new Date(`${selectedDate}T00:00:00Z`) : undefined}
                onSelect={(day) => {
                  if (!day) return;
                  onDateChange(isoDate(day));
                  setCalendarOpen(false);
                }}
                disabled={(day) => !dateSet.has(isoDate(day))}
              />
            </Popover.Content>
          </Popover.Root>

          <div className="ml-auto">
            <Tooltip.Provider>
              <Select.Root variant="compact" value={index} onValueChange={(v) => onIndexChange(v as ObservationIndex)}>
                <Select.Trigger aria-label="Layer" className="h-10 w-[150px]">
                  <Select.Value>{INDEX_LABELS[index]}</Select.Value>
                </Select.Trigger>
                <Select.Content className="w-[280px]">
                  {MENU_GROUPS.map((group, groupIndex) => (
                    <React.Fragment key={group.label}>
                      {groupIndex > 0 ? <Select.Separator /> : null}
                      <Select.Group>
                        <Select.GroupLabel>{group.label}</Select.GroupLabel>
                        {group.options.map((option) =>
                          option.available ? (
                            <Select.Item key={option.index} value={option.index}>
                              <span className="flex flex-1 items-center justify-between gap-2">
                                {INDEX_LABELS[option.index]}
                                <IndexInfoIcon index={option.index} />
                              </span>
                            </Select.Item>
                          ) : (
                            <UnavailableMenuItem key={option.key} option={option} />
                          ),
                        )}
                      </Select.Group>
                    </React.Fragment>
                  ))}
                </Select.Content>
              </Select.Root>
            </Tooltip.Provider>
          </div>
        </div>
      </div>
    </>
  );
}
