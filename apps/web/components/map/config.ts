/**
 * The map's colour palette (invariant 7, amended by TASK-fields §3.4 and
 * TASK-crop-stress §3.3: `packages/contracts/src/ramp.ts` now owns the NDVI
 * ramp's stops so the legend and the worker-painted PNG can never disagree —
 * this file re-exports them rather than declaring a second copy). Mapbox GL
 * paint properties are JSON values evaluated by Mapbox's own style parser,
 * not CSS — they cannot take a class and do not resolve `var(--color-*)`.
 * These are the same design tokens `app/globals.css` defines, converted
 * from `oklch()` to sRGB hex by hand (the standard CSS Color 4 OKLab
 * matrices) and checked against `get_screenshot` — this file has to be
 * re-derived, not just re-typed, if a token's `oklch()` value in
 * `globals.css` ever changes.
 */

export { NDVI_RAMP_STOPS } from "@flora/contracts";

/** `--color-green-600` / `--color-primary-base` (light theme) — the selected field's boundary. */
export const MAP_PRIMARY = "#1daf61";

/** `--color-slate-0` / `--color-neutral-0` — an unselected field's boundary (design-spec §5.2/§5.3: "white field boundaries"). */
export const MAP_BOUNDARY_DEFAULT = "#ffffff";

/** `--color-slate-950` / `--color-neutral-950` — the label halo, for legibility over photographic satellite imagery. */
export const MAP_LABEL_HALO = "#0e121b";

/** `--color-slate-0` — label text, read against the dark halo above. */
export const MAP_LABEL_TEXT = "#ffffff";

export const FIELD_LINE_WIDTH_DEFAULT = 2;
export const FIELD_LINE_WIDTH_SELECTED = 3;

/** A very low-opacity wash — the boundary line carries the shape; the fill only helps hit-testing and selection legibility. */
export const FIELD_FILL_OPACITY_DEFAULT = 0.04;
export const FIELD_FILL_OPACITY_SELECTED = 0.16;

export const LABEL_HALO_WIDTH = 1.5;
export const LABEL_TEXT_SIZE = 12;

/** `16:6309`'s outline colour — white, the same as an unselected field boundary, so it reads against the red/orange raster underneath it. */
export const STRESS_ZONE_LINE_DEFAULT = "#ffffff";
export const STRESS_ZONE_LINE_SELECTED = MAP_PRIMARY;
export const STRESS_ZONE_LINE_WIDTH_DEFAULT = 1.5;
export const STRESS_ZONE_LINE_WIDTH_SELECTED = 2.5;
export const STRESS_ZONE_FILL_OPACITY_DEFAULT = 0;
export const STRESS_ZONE_FILL_OPACITY_HOVERED = 0.12;
export const STRESS_ZONE_FILL_OPACITY_SELECTED = 0.2;
/** Muted zones (§2.8) render dimmed rather than hidden when "Show muted" is on. */
export const STRESS_ZONE_OPACITY_MUTED = 0.35;
