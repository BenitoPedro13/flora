import { RiArrowRightSLine, RiHeartAddFill, RiHeartAddLine } from "@remixicon/react";
import type { DashboardRegeneration, RegenerationClass } from "@flora/contracts";
import * as Button from "@/components/ui/button";
import * as Divider from "@/components/ui/divider";
import * as Tooltip from "@/components/ui/tooltip";
import { ArcGauge } from "@/components/charts/arc-gauge";
import { IconTile } from "./icon-tile";

/** AAFC's own five-class label (§2.4) — replaces the design's meaningless "total score" caption with a real reading. */
const CLASS_LABEL: Record<RegenerationClass, string> = {
  at_risk: "At risk",
  poor: "Poor",
  moderate: "Moderate",
  good: "Good",
  desired: "Desired",
};

function comparisonSentence(current: number, previous: number): string {
  if (current > previous) return "Nice, you had a greater score!";
  if (current < previous) return "Score dropped since yesterday.";
  return "Same score as yesterday.";
}

/**
 * §1.3, §2.4: a 180° arc gauge over the AAFC-sourced Regeneration Score, plus
 * yesterday's comparison — or, on a farm's first-ever score, the current
 * score's own components instead of a fabricated comparison.
 */
export function RegenerationCard({ regeneration }: { regeneration: DashboardRegeneration }) {
  const { current, previous } = regeneration;
  const presentCount = current.components.filter((c) => c.present).length;

  return (
    <div className="flex w-[335px] shrink-0 flex-col rounded-2xl border border-stroke-soft-200 bg-bg-white-0 p-4">
      <div className="flex h-7 items-center gap-2">
        <RiHeartAddLine className="size-6 shrink-0 text-text-sub-600" aria-hidden />
        <h3 className="flex-1 truncate text-label-md text-text-strong-950">Regeneration Score</h3>
        <Tooltip.Provider>
          <Tooltip.Root delayDuration={300}>
            <Tooltip.Trigger asChild>
              <span>
                <Button.Root variant="neutral" mode="stroke" size="xsmall" disabled>
                  Details
                </Button.Root>
              </span>
            </Tooltip.Trigger>
            <Tooltip.Content>No detail screen exists for this yet</Tooltip.Content>
          </Tooltip.Root>
        </Tooltip.Provider>
      </div>

      <div className="mt-[19px] h-[141px]">
        <ArcGauge value={current.score} valueLabel={Math.round(current.score)} label={CLASS_LABEL[current.class]} />
      </div>

      <Divider.Root className="my-4" />

      <div className="flex h-[37px] items-center gap-2">
        <IconTile size="37" tone="weak">
          <RiHeartAddFill className="size-[27.75px] text-primary-base" />
        </IconTile>
        <div className="min-w-0 flex-1">
          {previous ? (
            <>
              <p className="text-label-md text-text-strong-950">{Math.round(previous.score)}</p>
              <p className="truncate text-paragraph-xs text-text-sub-600">
                {comparisonSentence(current.score, previous.score)}
              </p>
            </>
          ) : (
            <p className="truncate text-paragraph-xs text-text-sub-600">
              First score — based on {presentCount}/3 component{presentCount === 1 ? "" : "s"}
            </p>
          )}
        </div>
        <RiArrowRightSLine className="size-5 shrink-0 text-text-soft-400" aria-hidden />
      </div>
    </div>
  );
}
