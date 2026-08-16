"use client";

import * as React from "react";
import { RiAddLine } from "@remixicon/react";
import type { FieldSummary } from "@flora/contracts";
import * as Button from "@/components/ui/button";
import { TaskEditor } from "./task-editor";

/**
 * The header's `+ Create Task` (§7 decision 7) — relabelled from the
 * design's undesignable `+ Create Request`, opening the existing
 * `TaskEditor`. The one client island the header needs (§2.13).
 */
export function CreateTaskButton({ fields }: { fields: FieldSummary[] }) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <Button.Root variant="primary" mode="filled" size="small" onClick={() => setOpen(true)}>
        <Button.Icon as={RiAddLine} />
        Create Task
      </Button.Root>
      <TaskEditor open={open} onOpenChange={setOpen} fields={fields} />
    </>
  );
}
