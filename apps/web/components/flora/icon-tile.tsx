import * as React from "react";
import { cn } from "@/utils/cn";

const sizeClasses = {
  "56": "size-14 rounded-[14px]",
  "40": "size-10 rounded-[10px]",
  "37": "size-[37px] rounded-lg",
} as const;

const toneClasses = {
  primary: "bg-primary-base text-static-white",
  weak: "bg-bg-weak-50 text-text-sub-600",
  white: "bg-bg-white-0 text-text-sub-600 ring-1 ring-inset ring-stroke-soft-200",
} as const;

/**
 * The rounded icon tile used across page headers, KPI tiles and the
 * Regeneration Score row (design-spec §4.5, §2.7). Pass a Remix icon element
 * as `children`.
 */
export function IconTile({
  size = "40",
  tone = "primary",
  className,
  children,
}: {
  size?: keyof typeof sizeClasses;
  tone?: keyof typeof toneClasses;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center",
        sizeClasses[size],
        toneClasses[tone],
        className,
      )}
    >
      {children}
    </div>
  );
}
