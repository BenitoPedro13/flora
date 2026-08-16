import { cn } from "@/utils/cn";

export interface UvTrackProps {
  uvIndex: number;
  className?: string;
}

/**
 * `2224:5030`'s track (§1.3) — a 320×9 rounded gradient (green → yellow →
 * red) with an 18px thumb positioned at `uvIndex / 12`, clamped to [0,1].
 * Invariant 7's exception: inline SVG resolves `var(--color-*)` directly
 * (`components/charts/config.ts` doc comment, TASK-weather §2.5).
 */
export function UvTrack({ uvIndex, className }: UvTrackProps) {
  const t = Math.min(1, Math.max(0, uvIndex / 12));
  return (
    <svg viewBox="0 0 320 18" className={cn("w-full", className)} role="img" aria-label={`UV index ${uvIndex.toFixed(1)}`}>
      <defs>
        <linearGradient id="uvTrackGradient" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--color-green-300)" />
          <stop offset="50%" stopColor="var(--color-yellow-400)" />
          <stop offset="100%" stopColor="var(--color-red-400)" />
        </linearGradient>
      </defs>
      <rect x="0" y="4.5" width="320" height="9" rx="4.5" fill="url(#uvTrackGradient)" />
      <circle
        cx={t * 320}
        cy="9"
        r="9"
        fill="var(--color-static-white)"
        stroke="var(--color-stroke-soft-200)"
        strokeWidth="1"
      />
    </svg>
  );
}
