"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { RiCheckboxCircleFill, RiCloseCircleFill, RiUploadCloud2Line } from "@remixicon/react";
import {
  formatAcres,
  importCommitResultSchema,
  importPreviewSchema,
  type Farm,
  type ImportPreviewRow,
} from "@flora/contracts";
import { apiFetchClient } from "@/lib/api-client";
import * as Button from "@/components/ui/button";
import * as FileUpload from "@/components/ui/file-upload";
import * as Modal from "@/components/ui/modal";
import * as Select from "@/components/ui/select";

/**
 * GeoJSON import, preview then commit (design-spec §6.2's `File Upload
 * Cards [1.0]` PRO block, rebuilt from base components — TASK-fields §2.9).
 * **No artboard** (design-spec §9 gap D18). Nothing is written until
 * Commit — architecture §11.5.
 */
export function ImportCard({
  open,
  onOpenChange,
  farms,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  farms: Farm[];
}) {
  const queryClient = useQueryClient();
  const [farmId, setFarmId] = React.useState(farms[0]?.id ?? "");
  const [rows, setRows] = React.useState<ImportPreviewRow[]>([]);
  const [selected, setSelected] = React.useState<Set<number>>(new Set());
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const previewMutation = useMutation({
    mutationFn: async (file: File) => {
      const text = await file.text();
      const body = text; // already a GeoJSON FeatureCollection document
      return apiFetchClient("/api/v1/fields/import/preview", importPreviewSchema, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      });
    },
    onSuccess: (preview) => {
      setRows(preview.rows);
      setSelected(new Set(preview.rows.filter((r) => r.valid).map((r) => r.index)));
    },
  });

  const commitMutation = useMutation({
    mutationFn: async () => {
      const acceptedRows = rows.filter((r) => selected.has(r.index) && r.valid && r.boundary);
      return apiFetchClient("/api/v1/fields/import/commit", importCommitResultSchema, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          farmId,
          rows: acceptedRows.map((r) => ({ name: r.name, boundary: r.boundary })),
        }),
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["fields"] });
      await queryClient.invalidateQueries({ queryKey: ["fields-geojson"] });
      setRows([]);
      setSelected(new Set());
      onOpenChange(false);
    },
  });

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      previewMutation.mutate(file);
    }
  }

  function toggleRow(index: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  const acceptedCount = rows.filter((r) => selected.has(r.index)).length;

  return (
    <Modal.Root open={open} onOpenChange={onOpenChange}>
      <Modal.Content className="max-w-[560px]" showClose>
        <Modal.Header title="Import fields" description="GeoJSON only — KML and Shapefile are not supported yet." />
        <Modal.Body className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto">
          {farms.length > 1 ? (
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
          ) : null}

          {rows.length === 0 ? (
            <FileUpload.Root>
              <input ref={fileInputRef} type="file" accept=".geojson,.json" className="sr-only" onChange={handleFileChange} />
              <FileUpload.Icon as={RiUploadCloud2Line} />
              <div className="flex flex-col gap-1 text-center">
                <span className="text-label-sm text-text-strong-950">
                  {previewMutation.isPending ? "Reading file…" : "Click to choose a .geojson file"}
                </span>
                <span className="text-paragraph-xs text-text-sub-600">A FeatureCollection of Polygon or MultiPolygon features.</span>
              </div>
              <FileUpload.Button>Browse</FileUpload.Button>
            </FileUpload.Root>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="max-h-80 overflow-y-auto rounded-lg ring-1 ring-inset ring-stroke-soft-200">
                <table className="w-full text-left text-paragraph-sm">
                  <thead className="bg-bg-weak-50 text-label-xs text-text-sub-600">
                    <tr>
                      <th className="w-8 p-2" />
                      <th className="p-2">Name</th>
                      <th className="p-2">Area</th>
                      <th className="p-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.index} className="border-t border-stroke-soft-200">
                        <td className="p-2">
                          <input
                            type="checkbox"
                            disabled={!row.valid}
                            checked={selected.has(row.index)}
                            onChange={() => toggleRow(row.index)}
                            aria-label={`Include ${row.name}`}
                          />
                        </td>
                        <td className="p-2 text-text-strong-950">{row.name}</td>
                        <td className="p-2 text-text-sub-600">{row.areaM2 != null ? formatAcres(row.areaM2) : "—"}</td>
                        <td className="p-2">
                          {row.valid ? (
                            <span className="inline-flex items-center gap-1 text-success-base">
                              <RiCheckboxCircleFill className="size-4" /> Valid
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-error-base" title={row.reason ?? undefined}>
                              <RiCloseCircleFill className="size-4" /> {row.reason}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Button.Root size="xsmall" variant="neutral" mode="ghost" onClick={() => { setRows([]); setSelected(new Set()); }}>
                Choose a different file
              </Button.Root>
            </div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <span className="text-paragraph-xs text-text-sub-600">
            {rows.length > 0 ? `${acceptedCount} of ${rows.length} selected` : ""}
          </span>
          <Button.Root
            size="small"
            variant="primary"
            mode="filled"
            disabled={rows.length === 0 || acceptedCount === 0 || !farmId || commitMutation.isPending}
            onClick={() => commitMutation.mutate()}
          >
            Commit {acceptedCount > 0 ? acceptedCount : ""} field{acceptedCount === 1 ? "" : "s"}
          </Button.Root>
        </Modal.Footer>
      </Modal.Content>
    </Modal.Root>
  );
}
