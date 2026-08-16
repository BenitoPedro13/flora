"use client";

import { RiArrowLeftSLine, RiArrowRightSLine } from "@remixicon/react";
import type { FarmWeatherDay, WeatherHorizon } from "@flora/contracts";
import { cn } from "@/utils/cn";

export interface DaySelectionStripProps {
  days: FarmWeatherDay[];
  selectedHorizon: WeatherHorizon;
  onSelect: (horizon: WeatherHorizon) => void;
}

const VISIBLE = 5;

function dayLabel(iso: string): { weekday: string; num: string } {
  const d = new Date(`${iso}T00:00:00Z`);
  return {
    weekday: d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }),
    num: d.toLocaleDateString("en-US", { day: "2-digit", timeZone: "UTC" }),
  };
}

/**
 * `Day Selection [Schedule] [1.0]` rebuild (§1.3) — 320×56, a ‹ › pager over
 * five visible days, the selected day a rounded-square green tile (not a
 * pill — found live against the reference: the mock's selected cell is
 * squircle-shaped). **Drives the six instrument cards, not the week list
 * below it** (§7 decision 1 — the mock's own strip and day list disagree,
 * and this is the only reading under which the right-hand column means
 * anything). ‹ clamps at horizon 0 — there is no stored past.
 *
 * **The window is derived from the selection, not independent pager
 * state** (found live): the mock always shows the selected day centered in
 * the strip. ‹/› move the *selection* by one day — the window then
 * re-centers on it automatically — rather than scrolling a window that can
 * drift out of sync with which day is actually selected.
 */
export function DaySelectionStrip({ days, selectedHorizon, onSelect }: DaySelectionStripProps) {
  const selectedIndex = Math.max(
    0,
    days.findIndex((d) => d.horizon === selectedHorizon),
  );
  const maxOffset = Math.max(0, days.length - VISIBLE);
  const offset = Math.min(maxOffset, Math.max(0, selectedIndex - Math.floor(VISIBLE / 2)));
  const visible = days.slice(offset, offset + VISIBLE);

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "ArrowLeft" && selectedIndex > 0) {
      e.preventDefault();
      onSelect(days[selectedIndex - 1]!.horizon);
    } else if (e.key === "ArrowRight" && selectedIndex < days.length - 1) {
      e.preventDefault();
      onSelect(days[selectedIndex + 1]!.horizon);
    }
  }

  return (
    <div
      className="flex h-14 w-[320px] shrink-0 items-center gap-1 outline-none"
      role="radiogroup"
      aria-label="Select a day"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <button
        type="button"
        aria-label="Earlier days"
        disabled={selectedIndex === 0}
        onClick={() => onSelect(days[selectedIndex - 1]!.horizon)}
        className="flex size-8 shrink-0 items-center justify-center rounded-full text-text-sub-600 transition hover:bg-bg-weak-50 disabled:pointer-events-none disabled:opacity-30"
      >
        <RiArrowLeftSLine className="size-4" />
      </button>
      <div className="flex flex-1 items-center justify-between">
        {visible.map((day) => {
          const { weekday, num } = dayLabel(day.date);
          const selected = day.horizon === selectedHorizon;
          return (
            <button
              key={day.horizon}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onSelect(day.horizon)}
              className={cn(
                "flex h-12 w-11 flex-col items-center justify-center gap-0.5 rounded-xl text-label-sm transition",
                selected ? "bg-primary-base text-static-white" : "text-text-sub-600 hover:bg-bg-weak-50",
              )}
            >
              <span className="text-subheading-2xs uppercase">{weekday}</span>
              <span>{num}</span>
            </button>
          );
        })}
      </div>
      <button
        type="button"
        aria-label="Later days"
        disabled={selectedIndex >= days.length - 1}
        onClick={() => onSelect(days[selectedIndex + 1]!.horizon)}
        className="flex size-8 shrink-0 items-center justify-center rounded-full text-text-sub-600 transition hover:bg-bg-weak-50 disabled:pointer-events-none disabled:opacity-30"
      >
        <RiArrowRightSLine className="size-4" />
      </button>
    </div>
  );
}
