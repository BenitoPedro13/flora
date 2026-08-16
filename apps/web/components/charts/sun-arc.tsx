import { cn } from "@/utils/cn";

export interface SunArcProps {
  sunrise?: string;
  sunset?: string;
  isToday: boolean;
  className?: string;
}

const R = 100;
const CX = 105;
const CY = 116;
const SUN_RAY_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315];

/** Open-Meteo's local-time ISO strings ("2026-08-16T06:30") — no zone suffix, so this is a plain string split, not a Date parse. */
function minutesOfDay(iso: string): number {
  const time = iso.split("T")[1] ?? "00:00";
  const [h, m] = time.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/**
 * `2029:27198`'s arc — rebuilt against the actual exported SVG (`docs/sunrise-sunset.svg`),
 * not a guess: a faint full dashed background track (always visible), a
 * solid amber "elapsed" arc drawn only from sunrise up to the current sun
 * position (not the whole dome), a matching gradient fill under just that
 * elapsed portion, a real sun glyph (circle + 8 rays, not a plain dot) at
 * the current position, and small foot tabs at both ends instead of a
 * vertical tick. `t = (now − sunrise) / (sunset − sunrise)`, clamped to
 * [0,1]. `now` reads the browser's own local clock (minutes-of-day) — no
 * farm-local live clock exists anywhere in the product yet (out of scope,
 * task doc §5). For a non-today day the marker parks at the apex and the
 * elapsed arc/fill are dropped (§1.3 note 4) — only the background track,
 * feet and sun glyph remain.
 */
export function SunArc({ sunrise, sunset, isToday, className }: SunArcProps) {
  let t = 0.5;
  if (isToday && sunrise && sunset) {
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const sunriseMin = minutesOfDay(sunrise);
    const sunsetMin = minutesOfDay(sunset);
    const span = sunsetMin - sunriseMin;
    t = span > 0 ? Math.min(1, Math.max(0, (nowMin - sunriseMin) / span)) : 0.5;
  }
  const angle = Math.PI * (1 - t);
  const mx = CX + R * Math.cos(angle);
  const my = CY - R * Math.sin(angle);
  const showElapsed = isToday;

  const elapsedArc = `M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${mx} ${my}`;
  const elapsedFill = `${elapsedArc} L ${mx} ${CY} L ${CX - R} ${CY} Z`;

  return (
    <svg
      viewBox="0 0 210 139"
      className={cn("w-full", className)}
      role="img"
      aria-label={sunrise && sunset ? `Sun between sunrise ${sunrise} and sunset ${sunset}` : "Sunrise and sunset unavailable"}
    >
      <defs>
        <linearGradient id="sunArcFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-orange-400)" stopOpacity={0.45} />
          <stop offset="100%" stopColor="var(--color-orange-400)" stopOpacity={0} />
        </linearGradient>
      </defs>

      {/* Full background track — always visible, both halves. */}
      <path
        d={`M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`}
        fill="none"
        stroke="var(--color-stroke-soft-200)"
        strokeWidth={2}
        strokeDasharray="1 6"
        strokeLinecap="round"
      />

      {showElapsed ? (
        <>
          <path d={elapsedFill} fill="url(#sunArcFill)" />
          <path
            d={elapsedArc}
            fill="none"
            stroke="var(--color-orange-500)"
            strokeWidth={2}
            strokeDasharray="1 6"
            strokeLinecap="round"
          />
        </>
      ) : null}

      {/* Foot tabs at both ends, not a vertical tick. */}
      <rect x={CX - R - 6} y={CY} width={12} height={3} fill="var(--color-orange-500)" />
      <rect x={CX + R - 6} y={CY} width={12} height={3} fill="var(--color-orange-500)" />

      {/* The sun glyph: circle + 8 rays, at the current position. */}
      <g>
        <circle cx={mx} cy={my} r={7} fill="var(--color-orange-400)" />
        {SUN_RAY_ANGLES.map((rayAngle) => {
          const rad = (rayAngle * Math.PI) / 180;
          const x1 = mx + 10 * Math.cos(rad);
          const y1 = my + 10 * Math.sin(rad);
          const x2 = mx + 13 * Math.cos(rad);
          const y2 = my + 13 * Math.sin(rad);
          return (
            <line
              key={rayAngle}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="var(--color-orange-400)"
              strokeWidth={2}
              strokeLinecap="round"
            />
          );
        })}
      </g>

      <text x={CX - R} y={CY + 24} textAnchor="start" className="fill-[var(--color-orange-500)] text-[11px]">
        Sunrise
      </text>
      <text x={CX + R} y={CY + 24} textAnchor="end" className="fill-[var(--color-orange-500)] text-[11px]">
        Sunset
      </text>
    </svg>
  );
}

/** The precise "5:50AM" form — exported so callers (the instrument card's footer) show the same precision as the arc's own labels, not a rounded hour. */
export function formatTime(iso: string): string {
  const time = iso.split("T")[1] ?? "";
  const [h, m] = time.split(":").map(Number);
  if (h === undefined || m === undefined) return "—";
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")}${period}`;
}
