"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RiAddLine, RiListCheck3, RiUploadCloud2Line } from "@remixicon/react";
import {
  taskBoardSchema,
  type FieldSummary,
  type Task,
  type TaskActivity,
  type TaskBoard,
  type TaskSort,
  type TaskStatus,
} from "@flora/contracts";
import { apiFetchClient, ApiError } from "@/lib/api-client";
import { toast } from "@/components/ui/toast";
import * as Root from "@/components/ui/toast-alert";
import * as Button from "@/components/ui/button";
import * as Tooltip from "@/components/ui/tooltip";
import { IconTile } from "@/components/flora/icon-tile";
import { PageContainer } from "@/components/flora/page-container";
import { PageHeader } from "@/components/flora/page-header";
import { KanbanBoard } from "@/components/flora/kanban-board";
import { TaskEditor } from "@/components/flora/task-editor";
import { TasksToolbar } from "@/components/flora/tasks-toolbar";

async function fetchBoard(params: { q: string; fieldId?: string; activity?: TaskActivity; sort: TaskSort }): Promise<TaskBoard> {
  const search = new URLSearchParams({ view: "board", sort: params.sort });
  if (params.q) search.set("q", params.q);
  if (params.fieldId) search.set("fieldId", params.fieldId);
  if (params.activity) search.set("activity", params.activity);
  return apiFetchClient(`/api/v1/tasks?${search.toString()}`, taskBoardSchema);
}

export interface BoardPanelProps {
  initialBoard: TaskBoard;
  fields: FieldSummary[];
}

function toastError(err: unknown, fallback: string) {
  const message = err instanceof ApiError ? err.message : fallback;
  toast.custom((t) => <Root.Root t={t} status="error" message={message} />);
}

/**
 * The Tasks screen body (`24:11420`, §2.7–§2.9) — `PageHeader` + toolbar +
 * `KanbanBoard`, owning the create/edit modal and the `/move` mutation.
 * Filters (`q`/`fieldId`/`activity`/`sort`) are local state, not URL params
 * — unlike Fields' `?field=` or Crop Stress's `?date=`, nothing here needs
 * a deep link or a browser-back affordance, so the extra `useSearchParams`
 * wiring wasn't worth it.
 */
export function BoardPanel({ initialBoard, fields }: BoardPanelProps) {
  const queryClient = useQueryClient();

  const [q, setQ] = React.useState("");
  const [fieldId, setFieldId] = React.useState<string | undefined>(undefined);
  const [activity, setActivity] = React.useState<TaskActivity | undefined>(undefined);
  const [sort, setSort] = React.useState<TaskSort>("position");
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editingTask, setEditingTask] = React.useState<Task | undefined>(undefined);
  const [defaultStatus, setDefaultStatus] = React.useState<TaskStatus | undefined>(undefined);

  const boardQuery = useQuery({
    queryKey: ["tasks-board", q, fieldId, activity, sort],
    queryFn: () => fetchBoard({ q, fieldId, activity, sort }),
    initialData: !q && !fieldId && !activity && sort === "position" ? initialBoard : undefined,
  });
  const board = boardQuery.data ?? initialBoard;

  interface MoveInput {
    taskId: string;
    status: TaskStatus;
    beforeId: string | null;
    afterId: string | null;
    optimisticColumns: TaskBoard["columns"];
  }

  const moveMutation = useMutation({
    mutationFn: (input: MoveInput) =>
      apiFetchClient(`/api/v1/tasks/${input.taskId}/move`, undefined, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: input.status, beforeId: input.beforeId, afterId: input.afterId }),
      }),
    // Runs synchronously inside `.mutate()` — by the time `KanbanBoard`
    // clears its own local drag preview right after calling `onMove`, this
    // has already written the same arrangement into the query cache, so
    // there's no flicker between "drag preview" and "server-confirmed"
    // states (NFR-9).
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: ["tasks-board"] });
      const previous = queryClient.getQueriesData<TaskBoard>({ queryKey: ["tasks-board"] });
      queryClient.setQueriesData<TaskBoard>({ queryKey: ["tasks-board"] }, (old) =>
        old ? { ...old, columns: input.optimisticColumns } : old,
      );
      return { previous };
    },
    onError: (err, _input, context) => {
      toastError(err, "Couldn't move the task");
      for (const [key, data] of context?.previous ?? []) {
        queryClient.setQueryData(key, data);
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["tasks-board"] }),
  });

  function openCreateEditor(status?: TaskStatus) {
    setEditingTask(undefined);
    setDefaultStatus(status);
    setEditorOpen(true);
  }

  function openEditEditor(task: Task) {
    setEditingTask(task);
    setDefaultStatus(undefined);
    setEditorOpen(true);
  }

  return (
    <>
      <PageHeader
        leading={
          <IconTile size="40" tone="primary">
            <RiListCheck3 className="size-5" />
          </IconTile>
        }
        title="Tasks"
        actions={
          <>
            <Tooltip.Provider>
              <Tooltip.Root delayDuration={300}>
                <Tooltip.Trigger asChild>
                  <span>
                    <Button.Root variant="neutral" mode="stroke" size="small" disabled>
                      <Button.Icon as={RiUploadCloud2Line} />
                      Import
                    </Button.Root>
                  </span>
                </Tooltip.Trigger>
                <Tooltip.Content>No import format is designed for tasks yet</Tooltip.Content>
              </Tooltip.Root>
            </Tooltip.Provider>
            <Button.Root variant="primary" mode="filled" size="small" onClick={() => openCreateEditor()}>
              <Button.Icon as={RiAddLine} />
              Create Task
            </Button.Root>
          </>
        }
      />

      <PageContainer className="flex flex-1 flex-col gap-6 overflow-y-auto py-6">
        <TasksToolbar
          q={q}
          onQChange={setQ}
          sort={sort}
          onSortChange={setSort}
          fieldId={fieldId}
          onFieldIdChange={setFieldId}
          activity={activity}
          onActivityChange={setActivity}
          fields={fields}
        />

        <KanbanBoard
          columns={board.columns}
          onTaskClick={openEditEditor}
          onAddTask={openCreateEditor}
          onMove={(taskId, input, optimisticColumns) =>
            moveMutation.mutate({
              taskId,
              ...input,
              optimisticColumns: optimisticColumns.map((c) => ({ ...c, total: c.tasks.length })),
            })
          }
        />
      </PageContainer>

      <TaskEditor open={editorOpen} onOpenChange={setEditorOpen} fields={fields} task={editingTask} defaultStatus={defaultStatus} />
    </>
  );
}
