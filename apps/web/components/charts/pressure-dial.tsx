import { cn } from "@/utils/cn";

export interface PressureDialProps {
  hpa?: number;
  className?: string;
}

const CX = 72;
const CY = 74;
const RING_R = 60;
const RING_WIDTH = 13;
const START_DEG = -150;
const SWEEP_DEG = 300;
const NEEDLE_LENGTH = 52;

/** `pressure_msl`, 950–1050 hPa (§7 decision 5) — not `surface_pressure`, which at this farm's 1,132m elevation would pin the needle at the floor. */
const MIN_HPA = 950;
const MAX_HPA = 1050;

function polar(angleDeg: number, r: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: CX + r * Math.sin(rad), y: CY - r * Math.cos(rad) };
}

function arcPath(startDeg: number, endDeg: number, r: number) {
  const p1 = polar(startDeg, r);
  const p2 = polar(endDeg, r);
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${p1.x} ${p1.y} A ${r} ${r} 0 ${largeArc} 1 ${p2.x} ${p2.y}`;
}

/**
 * `2031:27342`'s dial — rebuilt against the actual exported SVG
 * (`docs/pressure.svg`), not a guess: it is a **thick 300° ring gauge**
 * (the same shape family as Rain Chance's `RadialGauge`, just an open
 * sweep instead of a full circle), not a fan of 60 tick marks. A light-blue
 * background ring, a darker "elapsed" ring from the start up to
 * `(hPa − 950) / 100`, and a needle from the centre out to that same angle.
 * §7 decision 5's own "why" box explains the band: mean-sea-level pressure
 * supports one fixed scale regardless of a farm's altitude, unlike
 * `surface_pressure`.
 */
export function PressureDial({ hpa, className }: PressureDialProps) {
  const clamped = hpa === undefined ? MIN_HPA : Math.min(MAX_HPA, Math.max(MIN_HPA, hpa));
  const fraction = (clamped - MIN_HPA) / (MAX_HPA - MIN_HPA);
  const valueAngle = START_DEG + fraction * SWEEP_DEG;
  const needleTip = polar(valueAngle, NEEDLE_LENGTH);

  return (
    <svg
      viewBox="0 0 144 136"
      className={cn("w-full", className)}
      role="img"
      aria-label={hpa !== undefined ? `Pressure ${Math.round(hpa)} hPa` : "Pressure unavailable"}
    >
      <path
        d={arcPath(START_DEG, START_DEG + SWEEP_DEG, RING_R)}
        fill="none"
        stroke="var(--color-blue-100)"
        strokeWidth={RING_WIDTH}
        strokeLinecap="round"
        strokeDasharray="1 5"
      />
      <path
        d={arcPath(START_DEG, valueAngle, RING_R)}
        fill="none"
        stroke="var(--color-blue-300)"
        strokeWidth={RING_WIDTH}
        strokeLinecap="round"
        strokeDasharray="1 5"
      />
      <line
        x1={CX}
        y1={CY}
        x2={needleTip.x}
        y2={needleTip.y}
        stroke="var(--color-blue-700)"
        strokeWidth={3}
        strokeLinecap="round"
      />
      <circle cx={CX} cy={CY} r={6} fill="var(--color-static-white)" stroke="var(--color-blue-700)" strokeWidth={2} />
    </svg>
  );
}
