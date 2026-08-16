import { RiArrowDownLine, RiArrowUpLine } from "@remixicon/react";
import * as Badge from "@/components/ui/badge";

/**
 * Renders nothing for `null` — a KPI with no 7-day-old rollup to compare
 * against gets a 48px gap, never a fabricated `↗0%` (TASK-home-dashboard
 * §2.3). Colour and arrow direction come from the sign; `0` reads as up
 * (no change, not a decline).
 */
export function DeltaBadge({ deltaPct }: { deltaPct: number | null }) {
  if (deltaPct === null) {
    return null;
  }
  const isUp = deltaPct >= 0;
  return (
    <Badge.Root variant="lighter" color={isUp ? "green" : "red"} size="small">
      <Badge.Icon as={isUp ? RiArrowUpLine : RiArrowDownLine} />
      {Math.abs(deltaPct).toFixed(0)}%
    </Badge.Root>
  );
}
