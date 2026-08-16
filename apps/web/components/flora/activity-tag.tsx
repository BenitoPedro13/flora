import type * as React from "react";
import { RiBugFill, RiDropFill, RiFlashlightFill, RiScissorsCutFill, RiSeedlingFill } from "@remixicon/react";
import type { TaskActivity } from "@flora/contracts";
import * as Badge from "@/components/ui/badge";

/**
 * The field card's activity-tag row (design-spec §5.2, §3.3's palette) —
 * derived from a field's non-`done` tasks, in enum declaration order
 * (`packages/db/src/queries/fields.ts`'s `listFields`, TASK-domain-schema
 * §7). Icons and colours for `watering`/`fertilization`/`planting`/
 * `pest_control` are read off the Figma (`get_design_context` on
 * `2158:18884`/`19459`/`19362`/`19539`, TASK-fields §2.12) — `pest_control`'s
 * pink resolves design-spec §3.3's `[VERIFY]` (`bg-highlighted-lighter`/
 * `text-highlighted-base`, `#fb4ba3`/`#ffebf4`). `harvesting` never appeared
 * on a fetched card, so its icon and `orange`/`warning` colour are a
 * best-effort match to the spec's stated palette — still open against
 * `24:11420` when Tasks ships.
 */
const ACTIVITY_META: Record<
  TaskActivity,
  { label: string; icon: typeof RiDropFill; color: React.ComponentProps<typeof Badge.Root>["color"] }
> = {
  watering: { label: "Watering", icon: RiDropFill, color: "sky" },
  planting: { label: "Planting", icon: RiSeedlingFill, color: "green" },
  fertilization: { label: "Fertilization", icon: RiFlashlightFill, color: "yellow" },
  pest_control: { label: "Pest Control", icon: RiBugFill, color: "pink" },
  harvesting: { label: "Harvesting", icon: RiScissorsCutFill, color: "orange" },
};

export function ActivityTag({ activity }: { activity: TaskActivity }) {
  const meta = ACTIVITY_META[activity];
  return (
    <Badge.Root variant="lighter" color={meta.color} size="medium">
      <Badge.Icon as={meta.icon} />
      {meta.label}
    </Badge.Root>
  );
}
