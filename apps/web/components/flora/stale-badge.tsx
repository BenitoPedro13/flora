"use client";

import * as Badge from "@/components/ui/badge";
import * as Tooltip from "@/components/ui/tooltip";

export interface StaleBadgeProps {
  label: string;
  reason: string;
}

/**
 * Extracted from `StressHeader` (NFR-8, `TASK-crop-stress` §2.7/§2.11) —
 * TASK-weather §2.6 needed the same "stale, here's when it last
 * succeeded" badge and the task doc's own instruction was "reuse if
 * reusable, extract if inline." An orange `Badge.Root` with a tooltip
 * naming why, nothing screen-specific.
 */
export function StaleBadge({ label, reason }: StaleBadgeProps) {
  return (
    <Tooltip.Provider>
      <Tooltip.Root delayDuration={200}>
        <Tooltip.Trigger asChild>
          <span>
            <Badge.Root variant="light" color="orange" size="medium">
              {label}
            </Badge.Root>
          </span>
        </Tooltip.Trigger>
        <Tooltip.Content side="bottom">{reason}</Tooltip.Content>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
