"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { RiAddLine, RiDeleteBinLine } from "@remixicon/react";
import {
  cropCycleStatusValues,
  cropSchema,
  fieldSchema,
  cropCycleSchema,
  kilogramsToTonnes,
  type Crop,
  type CropCycleStatus,
  type Farm,
  type MultiPolygon,
} from "@flora/contracts";
import { z } from "zod";
import { apiFetchClient, ApiError } from "@/lib/api-client";
import * as Button from "@/components/ui/button";
import * as CompactButton from "@/components/ui/compact-button";
import * as Hint from "@/components/ui/hint";
import * as Input from "@/components/ui/input";
import * as Label from "@/components/ui/label";
import * as Modal from "@/components/ui/modal";
import * as Select from "@/components/ui/select";
import { DrawControl } from "@/components/map/draw-control";
import { MapPlaceholder } from "@/components/map/map-placeholder";
import { Map as MapboxMap } from "react-map-gl/mapbox";
import bbox from "@turf/bbox";
import "mapbox-gl/dist/mapbox-gl.css";

const fieldWithCycleSchema = fieldSchema.extend({ cropCycle: cropCycleSchema.nullable() });
export { fieldWithCycleSchema };
export type EditingField = z.infer<typeof fieldWithCycleSchema>;

export interface FieldEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  farms: Farm[];
  crops: Crop[];
  /** Undefined = create mode. */
  field?: EditingField;
  /** Pre-filled from a "+ Add Field" click after drawing on the list map, or from a double-clicked polygon. */
  initialBoundary?: MultiPolygon | null;
}

function BoundaryMap({
  initialBoundary,
  onChange,
}: {
  initialBoundary: MultiPolygon | null;
  onChange: (boundary: MultiPolygon | null, areaM2: number | null) => void;
}) {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const initialViewState = React.useMemo(() => {
    if (initialBoundary) {
      const [west, south, east, north] = bbox(initialBoundary);
      return {
        bounds: [
          [west, south],
          [east, north],
        ] as [[number, number], [number, number]],
        fitBoundsOptions: { padding: 32 },
      };
    }
    // The design's Amazonas farm (architecture §5.3) — a reasonable default camera for a new field.
    return { longitude: -59.1328, latitude: -4.5831, zoom: 15 };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- fit once, from whatever boundary the editor opened with.

  if (!token) {
    return <MapPlaceholder />;
  }

  return (
    <MapboxMap
      mapboxAccessToken={token}
      mapStyle="mapbox://styles/mapbox/satellite-streets-v12"
      pitch={0}
      initialViewState={initialViewState}
      style={{ width: "100%", height: 260 }}
    >
      <DrawControl initialBoundary={initialBoundary} onChange={onChange} />
    </MapboxMap>
  );
}

/**
 * Create/edit field + current crop cycle (TASK-fields §2.8). **No artboard**
 * (design-spec §9 gap D16) — composed from AlignUI primitives and the §4.5
 * card anatomy. Three ways in: `+ Add Field`, `View Details`, and
 * double-clicking a polygon — all render this same component.
 */
export function FieldEditor({ open, onOpenChange, farms, crops, field, initialBoundary }: FieldEditorProps) {
  const isEdit = field !== undefined;
  const queryClient = useQueryClient();

  const [name, setName] = React.useState(field?.name ?? "");
  const [farmId, setFarmId] = React.useState(field?.farmId ?? farms[0]?.id ?? "");
  const [boundary, setBoundary] = React.useState<MultiPolygon | null>(field?.boundary ?? initialBoundary ?? null);
  const [areaM2, setAreaM2] = React.useState<number | null>(field?.areaM2 ?? null);
  const [cropId, setCropId] = React.useState(field?.cropCycle?.cropId ?? "");
  const [plantedOn, setPlantedOn] = React.useState(field?.cropCycle?.plantedOn ?? "");
  const [expectedHarvestOn, setExpectedHarvestOn] = React.useState(field?.cropCycle?.expectedHarvestOn ?? "");
  const [status, setStatus] = React.useState<CropCycleStatus>(field?.cropCycle?.status ?? "planned");
  const [quantityKg, setQuantityKg] = React.useState(field?.cropCycle?.quantityKg?.toString() ?? "");
  const [newSpeciesName, setNewSpeciesName] = React.useState("");
  const [addingSpecies, setAddingSpecies] = React.useState(false);
  const [confirmingDelete, setConfirmingDelete] = React.useState(false);
  const [localCrops, setLocalCrops] = React.useState(crops);

  const singleFarm = farms.length === 1;

  const addCropMutation = useMutation({
    mutationFn: (cropName: string) => apiFetchClient("/api/v1/crops", cropSchema, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: cropName }) }),
    onSuccess: (crop) => {
      setLocalCrops((prev) => [...prev, crop].sort((a, b) => a.name.localeCompare(b.name)));
      setCropId(crop.id);
      setNewSpeciesName("");
      setAddingSpecies(false);
    },
  });

  const cropCyclePayload =
    cropId && plantedOn && expectedHarvestOn
      ? {
          cropId,
          plantedOn,
          expectedHarvestOn,
          status,
          quantityKg: quantityKg ? Number(quantityKg) : null,
        }
      : undefined;

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!boundary) {
        throw new Error("Draw a boundary before saving");
      }
      const body = JSON.stringify(
        isEdit ? { name, boundary } : { farmId, name, boundary, cropCycle: cropCyclePayload },
      );
      if (isEdit) {
        return apiFetchClient(`/api/v1/fields/${field.id}`, fieldSchema, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body,
        });
      }
      return apiFetchClient("/api/v1/fields", fieldSchema, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["fields"] });
      await queryClient.invalidateQueries({ queryKey: ["fields-geojson"] });
      onOpenChange(false);
    },
  });

  const cropCycleMutation = useMutation({
    mutationFn: async () => {
      if (!isEdit || !cropCyclePayload) return;
      if (field.cropCycle) {
        await apiFetchClient(`/api/v1/crop-cycles/${field.cropCycle.id}`, cropCycleSchema, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(cropCyclePayload),
        });
      } else {
        await apiFetchClient(`/api/v1/fields/${field.id}/crop-cycles`, cropCycleSchema, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(cropCyclePayload),
        });
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!isEdit) return;
      await apiFetchClient(`/api/v1/fields/${field.id}`, undefined, { method: "DELETE" });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["fields"] });
      await queryClient.invalidateQueries({ queryKey: ["fields-geojson"] });
      onOpenChange(false);
    },
  });

  async function handleSave() {
    await saveMutation.mutateAsync();
    if (isEdit && cropCyclePayload) {
      await cropCycleMutation.mutateAsync();
    }
  }

  const error = saveMutation.error ?? cropCycleMutation.error ?? deleteMutation.error;
  const conflict = error instanceof ApiError && error.status === 409;

  return (
    <Modal.Root open={open} onOpenChange={onOpenChange}>
      <Modal.Content className="max-w-[520px]" showClose>
        <Modal.Header title={isEdit ? "Edit field" : "Add field"} description={isEdit ? field.name : "Draw a boundary and set the current crop cycle."} />
        <Modal.Body className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto">
          <div className="flex flex-col gap-1.5">
            <Label.Root htmlFor="field-name">Name</Label.Root>
            <Input.Root>
              <Input.Wrapper>
                <Input.Input id="field-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Field name" />
              </Input.Wrapper>
            </Input.Root>
          </div>

          {!singleFarm && !isEdit ? (
            <div className="flex flex-col gap-1.5">
              <Label.Root>Farm</Label.Root>
              <Select.Root value={farmId} onValueChange={setFarmId}>
                <Select.Trigger>
                  <Select.Value placeholder="Choose a farm" />
                </Select.Trigger>
                <Select.Content>
                  {farms.map((farm) => (
                    <Select.Item key={farm.id} value={farm.id}>
                      {farm.name}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select.Root>
            </div>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <Label.Root>Boundary</Label.Root>
            <BoundaryMap initialBoundary={boundary} onChange={(b, a) => { setBoundary(b); setAreaM2(a); }} />
            <p className="text-paragraph-xs text-text-sub-600">
              {areaM2 != null ? `${(areaM2 / 4046.8564224).toFixed(2)} ac drawn` : "Draw the field boundary on the map"}
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label.Root>Species</Label.Root>
            {addingSpecies ? (
              <div className="flex min-w-0 items-center gap-2">
                <Input.Root className="min-w-0 flex-1">
                  <Input.Wrapper>
                    <Input.Input
                      autoFocus
                      value={newSpeciesName}
                      onChange={(e) => setNewSpeciesName(e.target.value)}
                      placeholder="New species name"
                    />
                  </Input.Wrapper>
                </Input.Root>
                <Button.Root
                  size="xsmall"
                  variant="neutral"
                  mode="stroke"
                  className="shrink-0"
                  disabled={!newSpeciesName || addCropMutation.isPending}
                  onClick={() => addCropMutation.mutate(newSpeciesName)}
                >
                  Add
                </Button.Root>
                <CompactButton.Root
                  variant="ghost"
                  size="medium"
                  className="shrink-0"
                  onClick={() => setAddingSpecies(false)}
                  aria-label="Cancel"
                >
                  ×
                </CompactButton.Root>
              </div>
            ) : (
              <div className="flex min-w-0 items-center gap-2">
                <Select.Root value={cropId} onValueChange={setCropId}>
                  <Select.Trigger className="min-w-0 flex-1">
                    <Select.Value placeholder="Choose a species" />
                  </Select.Trigger>
                  <Select.Content>
                    {localCrops.map((crop) => (
                      <Select.Item key={crop.id} value={crop.id}>
                        {crop.name}
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select.Root>
                <CompactButton.Root variant="stroke" size="medium" className="shrink-0" onClick={() => setAddingSpecies(true)} aria-label="Add species">
                  <CompactButton.Icon as={RiAddLine} />
                </CompactButton.Root>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label.Root htmlFor="planted-on">Planted</Label.Root>
              <Input.Root>
                <Input.Wrapper>
                  <Input.Input id="planted-on" type="date" value={plantedOn} onChange={(e) => setPlantedOn(e.target.value)} />
                </Input.Wrapper>
              </Input.Root>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label.Root htmlFor="harvest-on">Expected harvest</Label.Root>
              <Input.Root>
                <Input.Wrapper>
                  <Input.Input id="harvest-on" type="date" value={expectedHarvestOn} onChange={(e) => setExpectedHarvestOn(e.target.value)} />
                </Input.Wrapper>
              </Input.Root>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label.Root>Status</Label.Root>
            <Select.Root value={status} onValueChange={(v) => setStatus(v as CropCycleStatus)}>
              <Select.Trigger>
                <Select.Value />
              </Select.Trigger>
              <Select.Content>
                {cropCycleStatusValues.map((value) => (
                  <Select.Item key={value} value={value}>
                    {value[0]!.toUpperCase() + value.slice(1)}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select.Root>
            {conflict ? <Hint.Root hasError>This field already has a growing crop cycle.</Hint.Root> : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label.Root htmlFor="quantity-kg">Quantity (kg)</Label.Root>
            <Input.Root>
              <Input.Wrapper>
                <Input.Input
                  id="quantity-kg"
                  type="number"
                  min={0}
                  value={quantityKg}
                  onChange={(e) => setQuantityKg(e.target.value)}
                  placeholder="0"
                />
                <Input.InlineAffix>{quantityKg ? `${kilogramsToTonnes(Number(quantityKg)).toFixed(1)} T` : ""}</Input.InlineAffix>
              </Input.Wrapper>
            </Input.Root>
          </div>

          {error && !conflict ? <Hint.Root hasError>{error.message}</Hint.Root> : null}
        </Modal.Body>
        <Modal.Footer>
          {isEdit ? (
            confirmingDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-paragraph-xs text-text-sub-600">Delete this field and its tasks and observations?</span>
                <Button.Root size="xsmall" variant="error" mode="filled" onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}>
                  Confirm delete
                </Button.Root>
                <Button.Root size="xsmall" variant="neutral" mode="ghost" onClick={() => setConfirmingDelete(false)}>
                  Cancel
                </Button.Root>
              </div>
            ) : (
              <Button.Root size="small" variant="error" mode="ghost" onClick={() => setConfirmingDelete(true)}>
                <Button.Icon as={RiDeleteBinLine} />
                Delete
              </Button.Root>
            )
          ) : (
            <span />
          )}
          <Button.Root
            size="small"
            variant="primary"
            mode="filled"
            disabled={!name || !boundary || !farmId || saveMutation.isPending}
            onClick={handleSave}
          >
            {isEdit ? "Save changes" : "Add field"}
          </Button.Root>
        </Modal.Footer>
      </Modal.Content>
    </Modal.Root>
  );
}
