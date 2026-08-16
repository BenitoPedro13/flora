import { cn } from "@/utils/cn";

export interface WindCompassProps {
  directionDeg?: number;
  speedKmh?: number;
  className?: string;
}

const CX = 99;
const CY = 99;
const RING_R = 90;
const NEEDLE_R = 82;
const ARROWHEAD_LENGTH = 12;
const ARROWHEAD_WIDTH = 9;

function polarFromNorth(angleDeg: number, r: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: CX + r * Math.sin(rad), y: CY - r * Math.cos(rad) };
}

const CARDINALS = ["N", "E", "S", "W"] as const;

/**
 * `2224:4975`'s compass — rebuilt against the actual exported SVG
 * (`docs/wind-direction.svg`), not a guess: an 8px-thick dashed ring (not a
 * hairline), a north triangle, and a single vector that crosses straight
 * **through the centre** — an arrowhead at the tail (opposite the wind
 * direction) and a hollow ring at the head (in the wind direction) — rather
 * than a ray running only from the centre outward.
 *
 * **All four cardinal points get a tick, not just E/W** (found live against
 * the reference — the source SVG only ticks E/W and leaves S bare, which
 * reads as a missing mark rather than an intentional asymmetry once all
 * four labels are on screen together).
 */
export function WindCompass({ directionDeg, speedKmh, className }: WindCompassProps) {
  const angle = directionDeg ?? 0;
  const head = polarFromNorth(angle, NEEDLE_R);
  const tail = polarFromNorth(angle + 180, NEEDLE_R);
  const north = polarFromNorth(0, RING_R);

  // Arrowhead triangle at the tail end, pointing further away from centre.
  const tailTip = polarFromNorth(angle + 180, NEEDLE_R + ARROWHEAD_LENGTH);
  const perpRad = ((angle + 180 + 90) * Math.PI) / 180;
  const px = Math.sin(perpRad) * (ARROWHEAD_WIDTH / 2);
  const py = -Math.cos(perpRad) * (ARROWHEAD_WIDTH / 2);
  const arrowheadPoints = `${tailTip.x},${tailTip.y} ${tail.x + px},${tail.y + py} ${tail.x - px},${tail.y - py}`;

  return (
    <svg
      // Margin beyond the 198×198 ring so the N/E/S/W labels at RING_R+18
      // (108, past the ring's own 99px half-width) aren't clipped by the
      // SVG's own viewBox boundary — found live, at the card's actual
      // render size the letters were invisible, not just tight.
      viewBox="-16 -16 230 230"
      className={cn("w-full", className)}
      role="img"
      aria-label={directionDeg !== undefined ? `Wind from ${Math.round(directionDeg)} degrees` : "Wind direction unavailable"}
    >
      <circle
        cx={CX}
        cy={CY}
        r={RING_R}
        fill="none"
        stroke="var(--color-stroke-soft-200)"
        strokeWidth={6}
        strokeDasharray="1 4"
        strokeLinecap="round"
      />
      {[90, 180, 270].map((a) => {
        const p1 = polarFromNorth(a, RING_R - 4);
        const p2 = polarFromNorth(a, RING_R + 4);
        return (
          <line
            key={a}
            x1={p1.x}
            y1={p1.y}
            x2={p2.x}
            y2={p2.y}
            stroke="var(--color-green-600)"
            strokeWidth={3}
            strokeLinecap="round"
          />
        );
      })}
      <polygon
        points={`${north.x},${north.y - 6} ${north.x - 5.5},${north.y + 5} ${north.x + 5.5},${north.y + 5}`}
        fill="var(--color-green-600)"
      />
      {CARDINALS.map((label, i) => {
        const p = polarFromNorth(i * 90, RING_R + 18);
        return (
          <text
            key={label}
            x={p.x}
            y={p.y}
            textAnchor="middle"
            dominantBaseline="middle"
            className="fill-text-soft-400 text-[18px] font-semibold"
          >
            {label}
          </text>
        );
      })}
      <line x1={tail.x} y1={tail.y} x2={head.x} y2={head.y} stroke="var(--chart-1)" strokeWidth={3} strokeLinecap="round" />
      <polygon points={arrowheadPoints} fill="var(--chart-1)" />
      <circle cx={head.x} cy={head.y} r={8.5} fill="var(--color-static-white)" stroke="var(--chart-1)" strokeWidth={2.5} />
      {/* The vector crosses straight through the centre (§ above) — a white
          disc keeps the line from cutting through the speed readout. It's
          `--color-static-white`, which never inverts in dark mode (unlike
          the semantic `bg-*` tokens) — the text drawn on it must match with
          `--color-static-black`, not the semantic `text-*` tokens, or it
          goes near-invisible (near-white-on-white) under dark mode, found
          live. */}
      <circle cx={CX} cy={CY} r={22} fill="var(--color-static-white)" />
      <text x={CX} y={CY - 6} textAnchor="middle" className="fill-[var(--color-static-black)] text-[17px] font-semibold">
        {speedKmh !== undefined ? Math.round(speedKmh) : "—"}
      </text>
      <text x={CX} y={CY + 14} textAnchor="middle" className="fill-[var(--color-static-black)] text-[11px] opacity-60">
        km/h
      </text>
    </svg>
  );
}
