import { RiMapPin2Line } from "@remixicon/react";

/**
 * What renders when `NEXT_PUBLIC_MAPBOX_TOKEN` is absent (§6 item 16). No
 * error state is designed (design-spec §9 D3) — a blank tile grid or a
 * thrown exception is worse than an honest panel.
 */
export function MapPlaceholder() {
  return (
    <div className="flex h-full w-full flex-1 flex-col items-center justify-center gap-3 bg-bg-weak-50 text-center">
      <RiMapPin2Line className="size-8 text-text-soft-400" />
      <p className="max-w-xs text-paragraph-sm text-text-sub-600">
        The map isn&apos;t configured in this environment — set
        NEXT_PUBLIC_MAPBOX_TOKEN to see field boundaries here.
      </p>
    </div>
  );
}
