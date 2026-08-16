"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { RiDeleteBinLine } from "@remixicon/react";
import {
  taskActivityValues,
  taskStatusValues,
  taskSchema,
  type FieldSummary,
  type Task,
  type TaskActivity,
  type TaskStatus,
} from "@flora/contracts";
import { apiFetchClient, ApiError } from "@/lib/api-client";
import * as Button from "@/components/ui/button";
import * as Hint from "@/components/ui/hint";
import * as Input from "@/components/ui/input";
import * as Label from "@/components/ui/label";
import * as Modal from "@/components/ui/modal";
import * as Select from "@/components/ui/select";
import * as Textarea from "@/components/ui/textarea";

const ACTIVITY_LABEL: Record<TaskActivity, string> = {
  watering: "Watering",
  planting: "Planting",
  fertilization: "Fertilization",
  pest_control: "Pest control",
  harvesting: "Harvesting",
};

const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  done: "Done",
};

const NO_FIELD_VALUE = "__none__";

export interface TaskEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fields: FieldSummary[];
  /** Undefined = create mode. */
  task?: Task;
  /** Pre-fills the column a "+"/"+ Add task" click was opened from (create mode only). */
  defaultStatus?: TaskStatus;
}

/**
 * Create/edit a task (§2.8) — a `Modal`, the same component for both,
 * mirroring `field-editor.tsx`'s precedent. **No create form is designed
 * anywhere in the file** (§1.4 row 6); this is built from AlignUI
 * primitives the way `FieldEditor` was for the same reason (design-spec §9
 * gap D16's sibling). Dates use plain `<input type="date">`, not the
 * heavier Popover+Calendar `Datepicker` `stress-header.tsx` uses for a
 * *designed* date control — there's nothing here to match pixel-for-pixel,
 * and `FieldEditor`'s planted/harvest fields already set this exact
 * precedent. The water-volume field (§2.3) renders only when the activity
 * is `watering`; its placement here is invented and logged as a gap.
 */
export function TaskEditor({ open, onOpenChange, fields, task, defaultStatus }: TaskEditorProps) {
  const isEdit = task !== undefined;
  const queryClient = useQueryClient();

  const [title, setTitle] = React.useState(task?.title ?? "");
  const [description, setDescription] = React.useState(task?.description ?? "");
  const [fieldId, setFieldId] = React.useState(task?.field?.id ?? NO_FIELD_VALUE);
  const [activity, setActivity] = React.useState<TaskActivity>(task?.activity ?? "watering");
  const [status, setStatus] = React.useState<TaskStatus>(task?.status ?? defaultStatus ?? "todo");
  const [progressPct, setProgressPct] = React.useState(task?.progressPct?.toString() ?? "");
  const [startsOn, setStartsOn] = React.useState(task?.startsOn ?? "");
  const [dueOn, setDueOn] = React.useState(task?.dueOn ?? "");
  const [waterVolumeM3, setWaterVolumeM3] = React.useState(task?.waterVolumeM3?.toString() ?? "");
  const [confirmingDelete, setConfirmingDelete] = React.useState(false);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body = JSON.stringify({
        title,
        description: description || null,
        fieldId: fieldId === NO_FIELD_VALUE ? null : fieldId,
        activity,
        status,
        progressPct: progressPct ? Number(progressPct) : null,
        startsOn: startsOn || null,
        dueOn: dueOn || null,
        waterVolumeM3: activity === "watering" && waterVolumeM3 ? Number(waterVolumeM3) : null,
      });
      if (isEdit) {
        return apiFetchClient(`/api/v1/tasks/${task.id}`, taskSchema, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body,
        });
      }
      return apiFetchClient("/api/v1/tasks", taskSchema, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["tasks-board"] });
      onOpenChange(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!isEdit) return;
      await apiFetchClient(`/api/v1/tasks/${task.id}`, undefined, { method: "DELETE" });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["tasks-board"] });
      onOpenChange(false);
    },
  });

  const error = saveMutation.error ?? deleteMutation.error;
  const message = error instanceof ApiError ? error.message : error?.message;

  return (
    <Modal.Root open={open} onOpenChange={onOpenChange}>
      <Modal.Content className="max-w-[480px]" showClose>
        <Modal.Header title={isEdit ? "Edit task" : "Create task"} description={isEdit ? task.title : "Add a task to the board."} />
        <Modal.Body className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto">
          <div className="flex flex-col gap-1.5">
            <Label.Root htmlFor="task-title">Title</Label.Root>
            <Input.Root>
              <Input.Wrapper>
                <Input.Input id="task-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Task title" />
              </Input.Wrapper>
            </Input.Root>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label.Root htmlFor="task-description">Description</Label.Root>
            <Textarea.Root
              id="task-description"
              simple
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional details"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label.Root>Field</Label.Root>
            <Select.Root value={fieldId} onValueChange={setFieldId}>
              <Select.Trigger>
                <Select.Value placeholder="No field" />
              </Select.Trigger>
              <Select.Content>
                <Select.Item value={NO_FIELD_VALUE}>No field</Select.Item>
                {fields.map((field) => (
                  <Select.Item key={field.id} value={field.id}>
                    {field.name}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select.Root>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label.Root>Activity</Label.Root>
              <Select.Root value={activity} onValueChange={(v) => setActivity(v as TaskActivity)}>
                <Select.Trigger>
                  <Select.Value />
                </Select.Trigger>
                <Select.Content>
                  {taskActivityValues.map((value) => (
                    <Select.Item key={value} value={value}>
                      {ACTIVITY_LABEL[value]}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select.Root>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label.Root>Status</Label.Root>
              <Select.Root value={status} onValueChange={(v) => setStatus(v as TaskStatus)}>
                <Select.Trigger>
                  <Select.Value />
                </Select.Trigger>
                <Select.Content>
                  {taskStatusValues.map((value) => (
                    <Select.Item key={value} value={value}>
                      {STATUS_LABEL[value]}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select.Root>
            </div>
          </div>

          {activity === "watering" ? (
            <div className="flex flex-col gap-1.5">
              <Label.Root htmlFor="water-volume">Water volume</Label.Root>
              <Input.Root>
                <Input.Wrapper>
                  <Input.Input
                    id="water-volume"
                    type="number"
                    min={0}
                    step="0.01"
                    value={waterVolumeM3}
                    onChange={(e) => setWaterVolumeM3(e.target.value)}
                    placeholder="0"
                  />
                  <Input.InlineAffix>m³</Input.InlineAffix>
                </Input.Wrapper>
              </Input.Root>
            </div>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <Label.Root htmlFor="task-progress">Progress</Label.Root>
            <Input.Root>
              <Input.Wrapper>
                <Input.Input
                  id="task-progress"
                  type="number"
                  min={0}
                  max={100}
                  value={progressPct}
                  onChange={(e) => setProgressPct(e.target.value)}
                  placeholder="0"
                />
                <Input.InlineAffix>%</Input.InlineAffix>
              </Input.Wrapper>
            </Input.Root>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label.Root htmlFor="starts-on">Start date</Label.Root>
              <Input.Root>
                <Input.Wrapper>
                  <Input.Input id="starts-on" type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
                </Input.Wrapper>
              </Input.Root>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label.Root htmlFor="due-on">Due date</Label.Root>
              <Input.Root>
                <Input.Wrapper>
                  <Input.Input id="due-on" type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} />
                </Input.Wrapper>
              </Input.Root>
            </div>
          </div>

          {message ? <Hint.Root hasError>{message}</Hint.Root> : null}
        </Modal.Body>
        <Modal.Footer>
          {isEdit ? (
            confirmingDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-paragraph-xs text-text-sub-600">Delete this task?</span>
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
            disabled={!title || !activity || saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            {isEdit ? "Save changes" : "Create task"}
          </Button.Root>
        </Modal.Footer>
      </Modal.Content>
    </Modal.Root>
  );
}
