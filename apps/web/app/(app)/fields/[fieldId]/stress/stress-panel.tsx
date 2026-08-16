"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RiLeafLine } from "@remixicon/react";
import {
  fieldFeatureCollectionSchema,
  fieldSchema,
  fieldSummarySchema,
  observationSchema,
  pageSchema,
  refreshAcceptedSchema,
  refreshJobStatusSchema,
  stressClassificationLabel,
  stressZoneSchema,
  stressZoneSortValues,
  type Field,
  type FieldFeatureCollection,
  type FieldSummary,
  type Observation,
  type ObservationIndex,
  type Page,
  type RefreshJobStatus,
  type StressClassification,
  type StressZone,
  type StressZoneSort,
} from "@flora/contracts";
import { z } from "zod";
import { apiFetchClient, ApiError } from "@/lib/api-client";
import { toast } from "@/components/ui/toast";
import * as Root from "@/components/ui/toast-alert";
import * as Select from "@/components/ui/select";
import { FieldMap } from "@/components/map/field-map";
import { RasterOverlay } from "@/components/map/raster-overlay";
import { StressZoneLayer } from "@/components/map/stress-zone-layer";
import { MapToolbar } from "@/components/map/map-toolbar";
import { ColorRampLegend } from "@/components/map/color-ramp-legend";
import { StressHeader } from "@/components/flora/stress-header";
import { StressSummary } from "@/components/flora/stress-summary";
import { StressZoneRow } from "@/components/flora/stress-zone-row";
import { StressPopover } from "@/components/flora/stress-popover";

const POLL_INTERVAL_MS = 2_000;
const POLL_TIMEOUT_MS = 2 * 60 * 1000;

async function fetchField(fieldId: string): Promise<Field> {
  return apiFetchClient(`/api/v1/fields/${fieldId}`, fieldSchema);
}
async function fetchObservations(fieldId: string, index: ObservationIndex): Promise<Observation[]> {
  return apiFetchClient(`/api/v1/fields/${fieldId}/observations?index=${index}`, z.array(observationSchema));
}
async function fetchStressZones(fieldId: string, sort: StressZoneSort): Promise<StressZone[]> {
  return apiFetchClient(`/api/v1/fields/${fieldId}/stress-zones?sort=${sort}`, z.array(stressZoneSchema));
}
async function fetchGeojson(): Promise<FieldFeatureCollection> {
  return apiFetchClient("/api/v1/fields/geojson", fieldFeatureCollectionSchema);
}
async function fetchFieldsList(): Promise<Page<FieldSummary>> {
  return apiFetchClient("/api/v1/fields?sort=position&limit=100", pageSchema(fieldSummarySchema));
}

export interface StressPanelProps {
  fieldId: string;
  initialField: Field;
  initialObservations: Observation[];
  initialStressZones: StressZone[];
  initialGeojson: FieldFeatureCollection;
  initialFields: FieldSummary[];
}

function toastError(err: unknown, fallback: string) {
  const message = err instanceof ApiError ? err.message : fallback;
  toast.custom((t) => <Root.Root t={t} status="error" message={message} />);
}

/**
 * The Crop Stress screen body (TASK-crop-stress §2.7–§2.13) — owns
 * selection, the three stress-zone mutations, the manual-refresh poll, and
 * renders `StressHeader` + the grouped detection list + `FieldMap` with the
 * raster/zone/toolbar/legend children. `?date=`/`?index=`/`?zone=` live in
 * the URL, same reasoning `TASK-fields` §2.7 applied to `?field=`.
 */
export function StressPanel({
  fieldId,
  initialField,
  initialObservations,
  initialStressZones,
  initialGeojson,
  initialFields,
}: StressPanelProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const indexParam = (searchParams.get("index") as ObservationIndex | null) ?? "ndvi";
  const dateParam = searchParams.get("date");
  const zoneParam = searchParams.get("zone");

  const [sort, setSort] = React.useState<StressZoneSort>("priority");
  const [showMuted, setShowMuted] = React.useState(false);
  const [hoveredZoneId, setHoveredZoneId] = React.useState<string | null>(null);
  const [pollingJobId, setPollingJobId] = React.useState<string | null>(null);
  const pollStartRef = React.useRef<number>(0);

  const fieldQuery = useQuery({
    queryKey: ["field", fieldId],
    queryFn: () => fetchField(fieldId),
    initialData: initialField,
  });
  const field = fieldQuery.data;

  const observationsQuery = useQuery({
    queryKey: ["observations", fieldId, indexParam],
    queryFn: () => fetchObservations(fieldId, indexParam),
    initialData: indexParam === "ndvi" ? initialObservations : undefined,
  });
  const observations = React.useMemo(() => observationsQuery.data ?? [], [observationsQuery.data]);

  const stressZonesQuery = useQuery({
    queryKey: ["stress-zones", fieldId, sort],
    queryFn: () => fetchStressZones(fieldId, sort),
    initialData: sort === "priority" ? initialStressZones : undefined,
  });
  const zones = React.useMemo(() => stressZonesQuery.data ?? [], [stressZonesQuery.data]);

  const geojsonQuery = useQuery({
    queryKey: ["fields-geojson"],
    queryFn: fetchGeojson,
    initialData: initialGeojson,
  });

  const fieldsListQuery = useQuery({
    queryKey: ["fields-header-list"],
    queryFn: fetchFieldsList,
    initialData: { items: initialFields, nextCursor: null },
  });

  function setParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.replace(`/fields/${fieldId}/stress?${params.toString()}`, { scroll: false });
  }

  const selectedDate = dateParam ?? observations[0]?.capturedOn;
  const currentObservation = observations.find((o) => o.capturedOn === selectedDate) ?? observations[0];
  const dates = React.useMemo(() => observations.map((o) => o.capturedOn), [observations]);

  const unmutedZones = React.useMemo(() => zones.filter((z) => z.mutedAt === null), [zones]);
  const visibleZones = showMuted ? zones : unmutedZones;
  const totalAreaM2 = unmutedZones.reduce((sum, z) => sum + z.areaM2, 0);

  const groups = React.useMemo(() => {
    const order: StressClassification[] = [];
    const byClass = new Map<StressClassification, StressZone[]>();
    for (const zone of visibleZones) {
      if (!byClass.has(zone.classification)) {
        order.push(zone.classification);
        byClass.set(zone.classification, []);
      }
      byClass.get(zone.classification)!.push(zone);
    }
    return order.map((classification) => ({ classification, zones: byClass.get(classification)! }));
  }, [visibleZones]);

  const selectedZone = zones.find((z) => z.id === zoneParam) ?? null;

  function selectZone(id: string | null) {
    setParam("zone", id);
    if (id) {
      const zone = zones.find((z) => z.id === id);
      if (zone && field) {
        const ring = zone.geometry.coordinates[0] ?? [];
        const points = ring.slice(0, -1);
        const [sumLon, sumLat] = points.reduce(([lon, lat], [x, y]) => [lon + x, lat + y], [0, 0]);
        // Fly-to is a courtesy, not correctness-critical — swallow if the map isn't ready yet.
        try {
          (window as unknown as { __floraMapInstance?: { flyTo: (opts: unknown) => void } }).__floraMapInstance?.flyTo({
            center: [sumLon / points.length, sumLat / points.length],
            zoom: 17,
            duration: 400,
          });
        } catch {
          // no-op
        }
      }
    }
  }

  const classifyMutation = useMutation({
    mutationFn: ({ id, classification }: { id: string; classification: StressClassification }) =>
      apiFetchClient(`/api/v1/stress-zones/${id}`, stressZoneSchema, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ classification }),
      }),
    onMutate: async ({ id, classification }) => {
      const key = ["stress-zones", fieldId, sort];
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<StressZone[]>(key);
      queryClient.setQueryData<StressZone[]>(key, (old) => old?.map((z) => (z.id === id ? { ...z, classification } : z)));
      return { previous };
    },
    onError: (err, _vars, context) => {
      queryClient.setQueryData(["stress-zones", fieldId, sort], context?.previous);
      toastError(err, "Couldn't update the classification");
    },
  });

  const muteMutation = useMutation({
    mutationFn: ({ id, muted }: { id: string; muted: boolean }) =>
      apiFetchClient(`/api/v1/stress-zones/${id}`, stressZoneSchema, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ muted }),
      }),
    onMutate: async ({ id, muted }) => {
      const key = ["stress-zones", fieldId, sort];
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<StressZone[]>(key);
      queryClient.setQueryData<StressZone[]>(key, (old) =>
        old?.map((z) => (z.id === id ? { ...z, mutedAt: muted ? new Date().toISOString() : null } : z)),
      );
      return { previous };
    },
    onError: (err, _vars, context) => {
      queryClient.setQueryData(["stress-zones", fieldId, sort], context?.previous);
      toastError(err, "Couldn't update the detection");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetchClient(`/api/v1/stress-zones/${id}`, undefined, { method: "DELETE" }),
    onMutate: async (id: string) => {
      const key = ["stress-zones", fieldId, sort];
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<StressZone[]>(key);
      queryClient.setQueryData<StressZone[]>(key, (old) => old?.filter((z) => z.id !== id));
      return { previous };
    },
    onSuccess: () => {
      selectZone(null);
      toast.custom((t) => <Root.Root t={t} status="success" message="Detection deleted" />);
    },
    onError: (err, _vars, context) => {
      queryClient.setQueryData(["stress-zones", fieldId, sort], context?.previous);
      toastError(err, "Couldn't delete the detection");
    },
  });

  const refreshMutation = useMutation({
    // `true_color` is the one on-demand exception (§2.5) — every other index
    // rides the same all-scalar-index job the nightly schedule already runs,
    // so the request body stays empty for them.
    mutationFn: () =>
      apiFetchClient(`/api/v1/fields/${fieldId}/observations/refresh`, refreshAcceptedSchema, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(indexParam === "true_color" ? { mode: "true_color" } : {}),
      }),
    onSuccess: (data) => {
      pollStartRef.current = Date.now();
      setPollingJobId(data.jobId);
    },
    onError: (err) => toastError(err, "Couldn't start a refresh"),
  });

  // `isPolling` is derived at render time, not stored — once the fetched
  // status is terminal, the query below disables itself and every consumer
  // (the refresh button, the "still polling" gate) reads that in the same
  // render, with nothing to reset via an effect.
  const jobStatusQuery = useQuery<RefreshJobStatus>({
    queryKey: ["refresh-job", fieldId, pollingJobId],
    queryFn: () => apiFetchClient(`/api/v1/fields/${fieldId}/observations/refresh/${pollingJobId}`, refreshJobStatusSchema),
    enabled: pollingJobId !== null,
    refetchInterval: (query) => {
      if (!pollingJobId) return false;
      if (Date.now() - pollStartRef.current > POLL_TIMEOUT_MS) return false;
      const state = query.state.data?.state;
      if (state === "completed" || state === "failed" || state === "unknown") return false;
      return POLL_INTERVAL_MS;
    },
  });
  const jobStatusData = jobStatusQuery.data;
  const isTerminalJobState =
    jobStatusData?.state === "completed" || jobStatusData?.state === "failed" || jobStatusData?.state === "unknown";
  const isPolling = pollingJobId !== null && !isTerminalJobState;

  // Side effects only — no React state is set here (the derivation above
  // already reflects "done polling" the moment the terminal status lands),
  // so this only ever invalidates queries and reports the outcome once per
  // transition.
  React.useEffect(() => {
    if (!pollingJobId || !jobStatusData) return;
    if (jobStatusData.state === "completed" || jobStatusData.state === "unknown") {
      void queryClient.invalidateQueries({ queryKey: ["observations", fieldId] });
      void queryClient.invalidateQueries({ queryKey: ["stress-zones", fieldId] });
      void queryClient.invalidateQueries({ queryKey: ["field", fieldId] });
      setParam("date", null);
    } else if (jobStatusData.state === "failed") {
      toastError(new Error(jobStatusData.failedReason ?? "Refresh failed"), "Refresh failed");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run when the polled state actually changes
  }, [jobStatusData?.state, pollingJobId]);

  const fields = fieldsListQuery.data?.items ?? initialFields;

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex w-[462px] shrink-0 flex-col overflow-y-auto border-r border-stroke-soft-200">
        <StressHeader
          fields={fields}
          currentField={field}
          onFieldChange={(id) => router.push(`/fields/${id}/stress`)}
          dates={dates}
          selectedDate={selectedDate}
          onDateChange={(d) => setParam("date", d)}
          index={indexParam}
          onIndexChange={(i) => setParam("index", i)}
        />

        {observationsQuery.isLoading ? (
          <div className="flex flex-col gap-2 p-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-[60px] animate-pulse rounded-lg bg-bg-weak-50" />
            ))}
          </div>
        ) : observationsQuery.isError ? (
          <div className="flex flex-col items-center gap-2 p-8 text-center">
            <p className="text-paragraph-sm text-text-sub-600">Couldn&apos;t load imagery for this field.</p>
            <button type="button" className="text-label-sm text-primary-base" onClick={() => void observationsQuery.refetch()}>
              Retry
            </button>
          </div>
        ) : observations.length === 0 ? (
          <div className="flex flex-col items-center gap-3 p-8 text-center">
            <p className="text-paragraph-sm text-text-sub-600">No imagery yet for this field.</p>
            <button
              type="button"
              className="rounded-lg bg-primary-base px-3 py-2 text-label-sm text-static-white"
              onClick={() => refreshMutation.mutate()}
              disabled={refreshMutation.isPending || isPolling}
            >
              Refresh imagery
            </button>
          </div>
        ) : (
          <>
            <StressSummary
              count={unmutedZones.length}
              totalAreaM2={totalAreaM2}
              showMuted={showMuted}
              onToggleShowMuted={() => setShowMuted((v) => !v)}
              onRefresh={() => refreshMutation.mutate()}
              refreshDisabled={refreshMutation.isPending || isPolling}
            />

            <div className="flex items-center gap-2 px-4 pb-2">
              <span className="text-label-xs text-text-sub-600">Sort:</span>
              <Select.Root variant="compact" value={sort} onValueChange={(v) => setSort(v as StressZoneSort)}>
                <Select.Trigger aria-label="Sort by" className="h-10 w-[87px]">
                  <Select.Value>{sort === "priority" ? "Priority" : sort === "newest" ? "Newest" : "Area"}</Select.Value>
                </Select.Trigger>
                <Select.Content>
                  {stressZoneSortValues.map((value) => (
                    <Select.Item key={value} value={value}>
                      {value === "priority" ? "Priority" : value === "newest" ? "Newest" : "Area"}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select.Root>
            </div>

            {visibleZones.length === 0 ? (
              <div className="flex flex-col items-center gap-2 p-8 text-center">
                <RiLeafLine className="size-8 text-success-base" />
                <p className="text-paragraph-sm text-text-sub-600">No stress detected.</p>
              </div>
            ) : (
              <div className="flex flex-1 flex-col">
                {groups.map((group) => (
                  <div key={group.classification}>
                    <div className="flex items-center gap-2 bg-bg-weak-50 px-4 py-2">
                      <RiLeafLine className="size-4 text-text-sub-600" />
                      <span className="text-subheading-2xs uppercase text-text-sub-600">
                        {stressClassificationLabel(group.classification)}
                      </span>
                    </div>
                    {group.zones.map((zone, i) => (
                      <StressZoneRow
                        key={zone.id}
                        zone={zone}
                        selected={zone.id === zoneParam}
                        hovered={zone.id === hoveredZoneId}
                        isFirst={i === 0}
                        onSelect={() => selectZone(zone.id)}
                        onHover={(hovered) => setHoveredZoneId(hovered ? zone.id : null)}
                        onClassify={(classification) => classifyMutation.mutate({ id: zone.id, classification })}
                        onToggleMute={() => muteMutation.mutate({ id: zone.id, muted: zone.mutedAt === null })}
                      />
                    ))}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <div className="relative flex-1">
        <FieldMap
          features={geojsonQuery.data ?? initialGeojson}
          selectedFieldId={fieldId}
          onSelectField={(id) => {
            if (id && id !== fieldId) router.push(`/fields/${id}/stress`);
          }}
        >
          {currentObservation ? <RasterOverlay rasterUrl={currentObservation.rasterUrl} bbox={currentObservation.bbox} /> : null}
          <StressZoneLayer
            zones={zones}
            selectedZoneId={zoneParam}
            hoveredZoneId={hoveredZoneId}
            onSelectZone={selectZone}
            onHoverZone={setHoveredZoneId}
            showMuted={showMuted}
          />
          <MapToolbar bounds={fieldBoundsFromGeojson(geojsonQuery.data ?? initialGeojson, fieldId)} />
          {/* true_color has no scalar value — no domain, no legend (§2.2). */}
          {currentObservation && indexParam !== "true_color" ? (
            <ColorRampLegend stats={currentObservation.stats} index={indexParam} />
          ) : null}
          <StressPopover
            zone={selectedZone}
            onOpenChange={(open) => !open && selectZone(null)}
            onClassify={(classification) => selectedZone && classifyMutation.mutate({ id: selectedZone.id, classification })}
            onMute={() => selectedZone && muteMutation.mutate({ id: selectedZone.id, muted: selectedZone.mutedAt === null })}
            onDelete={() => selectedZone && deleteMutation.mutate(selectedZone.id)}
          />
        </FieldMap>
      </div>
    </div>
  );
}

function fieldBoundsFromGeojson(geojson: FieldFeatureCollection, fieldId: string): [[number, number], [number, number]] {
  const feature = geojson.features.find((f) => f.properties.id === fieldId);
  if (!feature) return [[-180, -85], [180, 85]];
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const polygon of feature.geometry.coordinates) {
    for (const ring of polygon) {
      for (const [lon, lat] of ring) {
        west = Math.min(west, lon);
        south = Math.min(south, lat);
        east = Math.max(east, lon);
        north = Math.max(north, lat);
      }
    }
  }
  return [
    [west, south],
    [east, north],
  ];
}
