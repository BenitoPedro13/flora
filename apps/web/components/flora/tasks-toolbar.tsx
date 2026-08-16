import { RiFilter3Line, RiSearchLine, RiSortDesc } from "@remixicon/react";
import { taskActivityValues, taskSortValues, type FieldSummary, type TaskActivity, type TaskSort } from "@flora/contracts";
import * as Button from "@/components/ui/button";
import * as Dropdown from "@/components/ui/dropdown";
import * as Input from "@/components/ui/input";
import * as Kbd from "@/components/ui/kbd";
import * as SegmentedControl from "@/components/ui/segmented-control";
import * as Tooltip from "@/components/ui/tooltip";

const SORT_LABEL: Record<TaskSort, string> = {
  position: "Manual order",
  due_on: "Due date",
  created_at: "Date created",
};

const ACTIVITY_LABEL: Record<TaskActivity, string> = {
  watering: "Watering",
  planting: "Planting",
  fertilization: "Fertilization",
  pest_control: "Pest control",
  harvesting: "Harvesting",
};

export interface TasksToolbarProps {
  q: string;
  onQChange: (q: string) => void;
  sort: TaskSort;
  onSortChange: (sort: TaskSort) => void;
  fieldId: string | undefined;
  onFieldIdChange: (fieldId: string | undefined) => void;
  activity: TaskActivity | undefined;
  onActivityChange: (activity: TaskActivity | undefined) => void;
  fields: FieldSummary[];
}

/**
 * `Horizontal Filter [1.0]` (§1.3, measured): a 320px `Segmented Control`
 * — List and Timeline disabled with a tooltip (§7 decision 1, undesigned,
 * `TASK-crop-stress` §7's precedent for a disabled control over a hidden
 * one or an invented empty state) — and a right cluster of search, Filter,
 * and Sort by. Filter and Sort are built for real (§7 decision 3): both
 * have real backing columns, only their menu copy was undesigned.
 */
export function TasksToolbar({
  q,
  onQChange,
  sort,
  onSortChange,
  fieldId,
  onFieldIdChange,
  activity,
  onActivityChange,
  fields,
}: TasksToolbarProps) {
  const filterActive = fieldId !== undefined || activity !== undefined;

  return (
    <div className="flex items-center justify-between gap-4">
      <SegmentedControl.Root defaultValue="board" className="w-[320px]">
        <SegmentedControl.List>
          <SegmentedControl.Trigger value="board">Board</SegmentedControl.Trigger>
          <Tooltip.Provider>
            <Tooltip.Root delayDuration={300}>
              <Tooltip.Trigger asChild>
                <span>
                  <SegmentedControl.Trigger value="list" disabled>
                    List
                  </SegmentedControl.Trigger>
                </span>
              </Tooltip.Trigger>
              <Tooltip.Content>List view is not designed yet</Tooltip.Content>
            </Tooltip.Root>
            <Tooltip.Root delayDuration={300}>
              <Tooltip.Trigger asChild>
                <span>
                  <SegmentedControl.Trigger value="timeline" disabled>
                    Timeline
                  </SegmentedControl.Trigger>
                </span>
              </Tooltip.Trigger>
              <Tooltip.Content>Timeline view is not designed yet</Tooltip.Content>
            </Tooltip.Root>
          </Tooltip.Provider>
        </SegmentedControl.List>
      </SegmentedControl.Root>

      <div className="flex items-center gap-3">
        <Input.Root className="w-[300px]">
          <Input.Wrapper>
            <Input.Icon as={RiSearchLine} />
            <Input.Input placeholder="Search tasks" value={q} onChange={(e) => onQChange(e.target.value)} />
            <Input.InlineAffix>
              <Kbd.Root>⌘1</Kbd.Root>
            </Input.InlineAffix>
          </Input.Wrapper>
        </Input.Root>

        <Dropdown.Root>
          <Dropdown.Trigger asChild>
            <Button.Root variant="neutral" mode={filterActive ? "stroke" : "ghost"} size="small">
              <Button.Icon as={RiFilter3Line} />
              Filter
            </Button.Root>
          </Dropdown.Trigger>
          <Dropdown.Content align="end" className="w-[220px]">
            <Dropdown.Label>Field</Dropdown.Label>
            <Dropdown.RadioGroup value={fieldId ?? ""} onValueChange={(v) => onFieldIdChange(v || undefined)}>
              <Dropdown.RadioItem value="">All fields</Dropdown.RadioItem>
              {fields.map((field) => (
                <Dropdown.RadioItem key={field.id} value={field.id}>
                  {field.name}
                </Dropdown.RadioItem>
              ))}
            </Dropdown.RadioGroup>
            <Dropdown.Separator />
            <Dropdown.Label>Activity</Dropdown.Label>
            <Dropdown.RadioGroup value={activity ?? ""} onValueChange={(v) => onActivityChange((v || undefined) as TaskActivity | undefined)}>
              <Dropdown.RadioItem value="">All activities</Dropdown.RadioItem>
              {taskActivityValues.map((value) => (
                <Dropdown.RadioItem key={value} value={value}>
                  {ACTIVITY_LABEL[value]}
                </Dropdown.RadioItem>
              ))}
            </Dropdown.RadioGroup>
          </Dropdown.Content>
        </Dropdown.Root>

        <Dropdown.Root>
          <Dropdown.Trigger asChild>
            <Button.Root variant="neutral" mode="stroke" size="small">
              <Button.Icon as={RiSortDesc} />
              Sort by
            </Button.Root>
          </Dropdown.Trigger>
          <Dropdown.Content align="end" className="w-[180px]">
            <Dropdown.RadioGroup value={sort} onValueChange={(v) => onSortChange(v as TaskSort)}>
              {taskSortValues.map((value) => (
                <Dropdown.RadioItem key={value} value={value}>
                  {SORT_LABEL[value]}
                </Dropdown.RadioItem>
              ))}
            </Dropdown.RadioGroup>
          </Dropdown.Content>
        </Dropdown.Root>
      </div>
    </div>
  );
}
