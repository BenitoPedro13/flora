/**
 * The single conversion point between canonical SI storage (m², kg) and the
 * fixed display units decided 2026-08-15 (architecture §5.3): acres and
 * metric tonnes. Every acreage and tonnage in the UI goes through this
 * module — nothing else is allowed to hand-roll the constant.
 */

/** Exact: 1 acre = 4840 sq yd, 1 yd = 0.9144 m. */
export const SQUARE_METRES_PER_ACRE = 4046.8564224;
export const KILOGRAMS_PER_TONNE = 1000;

export function squareMetresToAcres(m2: number): number {
  return m2 / SQUARE_METRES_PER_ACRE;
}

export function kilogramsToTonnes(kg: number): number {
  return kg / KILOGRAMS_PER_TONNE;
}

/** "24.1 ac" — design-spec §5.3's stress-total format. */
export function formatAcres(m2: number): string {
  return `${squareMetresToAcres(m2).toFixed(1)} ac`;
}

/** "1.9 T" — design-spec §5.2's field-card quantity format. */
export function formatTonnes(kg: number): string {
  return `${kilogramsToTonnes(kg).toFixed(1)} T`;
}

/**
 * 1 m³ = 1 kL exactly — a rename for display, never a conversion
 * (TASK-home-dashboard §7 decision 1). `tasks.water_volume_m3` stays the
 * canonical SI column; kilolitres is only how the Water Used KPI tile
 * labels the same number.
 */
export function formatKiloliters(m3: number): string {
  return `${m3.toFixed(1)} kL`;
}
