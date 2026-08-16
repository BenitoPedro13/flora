"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { RiAddLine, RiUploadCloud2Line } from "@remixicon/react";
import {
  fieldFeatureCollectionSchema,
  pageSchema,
  fieldSummarySchema,
  type Crop,
  type Farm,
  type FieldFeatureCollection,
  type FieldSort,
  type FieldSummary,
  type Page,
} from "@flora/contracts";
import { apiFetchClient } from "@/lib/api-client";
import { PageHeader } from "@/components/flora/page-header";
import { IconTile } from "@/components/flora/icon-tile";
import { FieldCard } from "@/components/flora/field-card";
import { FieldEditor, fieldWithCycleSchema, type EditingField } from "@/components/flora/field-editor";
import { ImportCard } from "@/components/flora/import-card";
import { FieldMap } from "@/components/map/field-map";
import * as Button from "@/components/ui/button";
import { RiLandscapeLine } from "@remixicon/react";
import { FieldsToolbar } from "./fields-toolbar";

async function fetchFieldsPage(params: { q?: string; sort: FieldSort; cropId?: string; cursor?: string }): Promise<Page<FieldSummary>> {
  const search = new URLSearchParams();
  search.set("sort", params.sort);
  if (params.q) search.set("q", params.q);
  if (params.cropId) search.set("cropId", params.cropId);
  if (params.cursor) search.set("cursor", params.cursor);
  return apiFetchClient(`/api/v1/fields?${search.toString()}`, pageSchema(fieldSummarySchema));
}

async function fetchGeojson(): Promise<FieldFeatureCollection> {
  return apiFetchClient("/api/v1/fields/geojson", fieldFeatureCollectionSchema);
}

export interface FieldListPanelProps {
  initialFieldsPage: Page<FieldSummary>;
  initialGeojson: FieldFeatureCollection;
  farms: Farm[];
  crops: Crop[];
}

/**
 * The Fields screen body (TASK-fields §2.7) — `PageHeader` + a 715px scroll
 * panel of `FieldCard`s + the full-bleed `FieldMap`. One client component
 * rather than server header / client panel split: the header's Import and
 * + Add Field actions open modals, so they need the interactivity anyway,
 * and splitting them out for a marginally smaller server payload wasn't
 * worth the prop-drilling it costs across the mutation/selection state this
 * screen already centralizes here.
 */
export function FieldListPanel({ initialFieldsPage, initialGeojson, farms, crops }: FieldListPanelProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedFieldId = searchParams.get("field");

  const [search, setSearch] = React.useState("");
  const [sort, setSort] = React.useState<FieldSort>("position");
  const [cropId, setCropId] = React.useState<string | undefined>(undefined);
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editingField, setEditingField] = React.useState<EditingField | undefined>(undefined);
  const [importOpen, setImportOpen] = React.useState(false);

  const isFirstPage = !search && sort === "position" && !cropId;

  const fieldsQuery = useInfiniteQuery({
    queryKey: ["fields", { search, sort, cropId }],
    queryFn: ({ pageParam }) => fetchFieldsPage({ q: search || undefined, sort, cropId, cursor: pageParam as string | undefined }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    initialData: isFirstPage ? { pages: [initialFieldsPage], pageParams: [undefined] } : undefined,
  });

  const geojsonQuery = useQuery({
    queryKey: ["fields-geojson"],
    queryFn: fetchGeojson,
    initialData: initialGeojson,
  });

  const fields = fieldsQuery.data?.pages.flatMap((p) => p.items) ?? [];

  function setSelectedFieldId(id: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (id) params.set("field", id);
    else params.delete("field");
    router.replace(`/fields?${params.toString()}`, { scroll: false });
  }

  // Bumped on every open so `<FieldEditor key={...}>` always remounts —
  // its form fields are `useState`, initialized once from `field`, so
  // reopening the *same* field (id unchanged) needs a fresh mount too, or
  // stale unsaved input from the last time it was open would resurface.
  const [editorOpenCount, setEditorOpenCount] = React.useState(0);

  async function openEditorFor(fieldId: string) {
    const detail = await apiFetchClient(`/api/v1/fields/${fieldId}`, fieldWithCycleSchema);
    setEditingField(detail);
    setEditorOpen(true);
    setEditorOpenCount((n) => n + 1);
  }

  function openCreateEditor() {
    setEditingField(undefined);
    setEditorOpen(true);
    setEditorOpenCount((n) => n + 1);
  }

  const scrollRef = React.useRef<HTMLDivElement>(null);
  function handleScroll() {
    const el = scrollRef.current;
    if (!el || !fieldsQuery.hasNextPage || fieldsQuery.isFetchingNextPage) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 200) {
      void fieldsQuery.fetchNextPage();
    }
  }

  return (
    <>
      <PageHeader
        leading={
          <IconTile size="40" tone="primary">
            <RiLandscapeLine className="size-5" />
          </IconTile>
        }
        title="Fields"
        actions={
          <>
            <Button.Root variant="neutral" mode="stroke" size="small" onClick={() => setImportOpen(true)}>
              <Button.Icon as={RiUploadCloud2Line} />
              Import
            </Button.Root>
            <Button.Root variant="primary" mode="filled" size="small" onClick={openCreateEditor}>
              <Button.Icon as={RiAddLine} />
              Add Field
            </Button.Root>
          </>
        }
      />
      <div className="flex min-h-0 flex-1">
        <div ref={scrollRef} onScroll={handleScroll} className="flex w-[715px] shrink-0 flex-col overflow-y-auto border-r border-stroke-soft-200">
          <FieldsToolbar
            search={search}
            onSearchChange={setSearch}
            sort={sort}
            onSortChange={setSort}
            cropId={cropId}
            onCropIdChange={setCropId}
            crops={crops}
          />
          {fields.length === 0 && !fieldsQuery.isLoading ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
              <p className="text-paragraph-sm text-text-sub-600">No fields yet.</p>
              <Button.Root variant="primary" mode="filled" size="small" onClick={openCreateEditor}>
                <Button.Icon as={RiAddLine} />
                Add Field
              </Button.Root>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 p-4">
              {fields.map((field) => (
                <FieldCard
                  key={field.id}
                  field={field}
                  selected={field.id === selectedFieldId}
                  onSelect={() => setSelectedFieldId(field.id)}
                  onViewDetails={() => void openEditorFor(field.id)}
                />
              ))}
            </div>
          )}
        </div>
        <div className="relative flex-1">
          <FieldMap
            features={geojsonQuery.data ?? initialGeojson}
            selectedFieldId={selectedFieldId}
            onSelectField={setSelectedFieldId}
            onFieldDoubleClick={(id) => void openEditorFor(id)}
          />
        </div>
      </div>

      <FieldEditor
        key={`${editingField?.id ?? "new"}-${editorOpenCount}`}
        open={editorOpen}
        onOpenChange={setEditorOpen}
        farms={farms}
        crops={crops}
        field={editingField}
      />
      <ImportCard open={importOpen} onOpenChange={setImportOpen} farms={farms} />
    </>
  );
}
