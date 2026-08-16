"use client";

import * as React from "react";
import { RiSearchLine } from "@remixicon/react";
import type { Crop, FieldSort } from "@flora/contracts";
import * as Input from "@/components/ui/input";
import * as Kbd from "@/components/ui/kbd";
import * as Select from "@/components/ui/select";

const SORT_LABELS: Record<FieldSort, string> = {
  position: "Manual",
  name: "Name A–Z",
  "-name": "Name Z–A",
  newest: "Newest",
};

/**
 * Search (⌘1) · Filter · Sort by (design-spec §5.2). Neither has a designed
 * menu (design-spec §9 gap D17) — `Select` compact triggers stand in.
 */
export function FieldsToolbar({
  search,
  onSearchChange,
  sort,
  onSortChange,
  cropId,
  onCropIdChange,
  crops,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  sort: FieldSort;
  onSortChange: (value: FieldSort) => void;
  cropId: string | undefined;
  onCropIdChange: (value: string | undefined) => void;
  crops: Crop[];
}) {
  const searchInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    function handleKeydown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "1") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, []);

  return (
    <div className="flex items-center gap-2 border-b border-stroke-soft-200 p-4">
      <Input.Root className="flex-1">
        <Input.Wrapper>
          <Input.Icon as={RiSearchLine} />
          <Input.Input
            ref={searchInputRef}
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search fields"
            aria-label="Search fields"
          />
          <Kbd.Root>⌘1</Kbd.Root>
        </Input.Wrapper>
      </Input.Root>

      <Select.Root
        variant="compact"
        value={cropId ?? "__all__"}
        onValueChange={(v) => onCropIdChange(v === "__all__" ? undefined : v)}
      >
        <Select.Trigger aria-label="Filter by crop">
          <Select.Value placeholder="Filter" />
        </Select.Trigger>
        <Select.Content>
          <Select.Item value="__all__">All crops</Select.Item>
          {crops.map((crop) => (
            <Select.Item key={crop.id} value={crop.id}>
              {crop.name}
            </Select.Item>
          ))}
        </Select.Content>
      </Select.Root>

      <Select.Root variant="compact" value={sort} onValueChange={(v) => onSortChange(v as FieldSort)}>
        <Select.Trigger aria-label="Sort by">
          <Select.Value>{SORT_LABELS[sort]}</Select.Value>
        </Select.Trigger>
        <Select.Content>
          {(Object.keys(SORT_LABELS) as FieldSort[]).map((value) => (
            <Select.Item key={value} value={value}>
              {SORT_LABELS[value]}
            </Select.Item>
          ))}
        </Select.Content>
      </Select.Root>
    </div>
  );
}
