import { RiMoreFill, RiRefreshLine } from "@remixicon/react";
import { formatAcres } from "@flora/contracts";
import * as CompactButton from "@/components/ui/compact-button";
import * as Dropdown from "@/components/ui/dropdown";

export interface StressSummaryProps {
  count: number;
  totalAreaM2: number;
  showMuted: boolean;
  onToggleShowMuted: () => void;
  onRefresh: () => void;
  refreshDisabled: boolean;
}

/**
 * `18:7042` — `"{n} stress detected"` + acreage, and the overflow menu
 * (`18:7047`) carrying Refresh imagery and Show muted. Muted zones are
 * excluded from both the count and the acreage (TASK-crop-stress §2.8) —
 * `count`/`totalAreaM2` are handed in already filtered by the caller.
 */
export function StressSummary({ count, totalAreaM2, showMuted, onToggleShowMuted, onRefresh, refreshDisabled }: StressSummaryProps) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <div className="flex items-baseline gap-1.5">
        <span className="text-label-md text-text-strong-950">{count} stress detected</span>
        <span className="text-paragraph-xs text-text-sub-600">{formatAcres(totalAreaM2)}</span>
      </div>

      <Dropdown.Root>
        <Dropdown.Trigger asChild>
          <CompactButton.Root variant="ghost" aria-label="Detection options">
            <CompactButton.Icon as={RiMoreFill} />
          </CompactButton.Root>
        </Dropdown.Trigger>
        <Dropdown.Content align="end" className="w-[220px]">
          <Dropdown.Item disabled={refreshDisabled} onSelect={() => onRefresh()}>
            <Dropdown.ItemIcon as={RiRefreshLine} />
            Refresh imagery
          </Dropdown.Item>
          <Dropdown.CheckboxItem checked={showMuted} onCheckedChange={onToggleShowMuted}>
            Show muted
          </Dropdown.CheckboxItem>
        </Dropdown.Content>
      </Dropdown.Root>
    </div>
  );
}
