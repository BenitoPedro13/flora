"use client";

import * as React from "react";
import { RiCalendarLine, RiLandscapeLine, RiRadarFill } from "@remixicon/react";
import type { Field, FieldSummary, ObservationIndex } from "@flora/contracts";
import { observationIndexValues } from "@flora/contracts";
import * as Badge from "@/components/ui/badge";
import { Calendar } from "@/components/ui/datepicker";
import * as Popover from "@/components/ui/popover";
import * as Select from "@/components/ui/select";
import * as Tooltip from "@/components/ui/tooltip";
import { IconTile } from "@/components/flora/icon-tile";
import { PageHeader } from "@/components/flora/page-header";

const INDEX_LABELS: Record<ObservationIndex, string> = {
  ndvi: "NDVI",
  ndre: "NDRE",
  ndwi: "NDWI",
  evi: "EVI",
  true_color: "True colour",
};

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

/**
 * `2171:9757` (the field-switcher `PageHeader`) plus `18:7017` ("Crop
 * Stress" + the Date: row) and NFR-8's stale badge (TASK-crop-stress §2.7,
 * §2.11) — grouped in one file per §4's affected-files table.
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
            <Tooltip.Provider>
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
            </Tooltip.Provider>
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
            <Select.Root variant="compact" value={index} onValueChange={(v) => onIndexChange(v as ObservationIndex)}>
              <Select.Trigger aria-label="Index" className="h-10 w-[74px]">
                <Select.Value>{INDEX_LABELS[index]}</Select.Value>
              </Select.Trigger>
              <Select.Content>
                {observationIndexValues.map((value) => (
                  <Select.Item key={value} value={value}>
                    {INDEX_LABELS[value]}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select.Root>
          </div>
        </div>
      </div>
    </>
  );
}
