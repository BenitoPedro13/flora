"use client";

import * as React from "react";
import {
  closestCorners,
  DndContext,
  DragOverlay,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { taskStatusValues, type Task, type TaskStatus } from "@flora/contracts";
import { cn } from "@/utils/cn";
import { KanbanColumn } from "./kanban-column";
import { TaskCard } from "./task-card";

function SortableTaskCard({ task, onClick }: { task: Task; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      {...attributes}
      {...listeners}
    >
      <TaskCard task={task} onClick={onClick} />
    </div>
  );
}

/**
 * The droppable target for a column's card list — `useDroppable({id:
 * status})` gives an empty column (or the gap below its last card) a real
 * drop target even when it hugs its content down to a couple of px (§6
 * item 5, §8's named risk). `min-h-[60px]` is the mitigation, a deliberate
 * deviation from the artboard.
 */
function DroppableCardList({ status, children }: { status: TaskStatus; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <div
      ref={setNodeRef}
      className={cn("mt-[11px] flex min-h-[60px] flex-col gap-[11px] rounded-xl transition-colors", isOver && "bg-bg-soft-200/50")}
    >
      {children}
    </div>
  );
}

export type KanbanBoardColumn = { status: TaskStatus; tasks: Task[] };

export interface KanbanBoardProps {
  columns: KanbanBoardColumn[];
  onTaskClick: (task: Task) => void;
  onAddTask: (status: TaskStatus) => void;
  /**
   * `optimisticColumns` is this component's own already-computed drag
   * result, handed up so the caller can write it straight into the query
   * cache from the mutation's `onMutate` — synchronously, inside the same
   * `handleDragEnd` call, so `columnsProp` already matches by the time
   * this component clears its local drag override right after calling
   * this. That's what keeps NFR-9's optimistic paint flicker-free without
   * a prop-mirroring effect (see the `dragColumns` comment above).
   */
  onMove: (
    taskId: string,
    input: { status: TaskStatus; beforeId: string | null; afterId: string | null },
    optimisticColumns: KanbanBoardColumn[],
  ) => void;
}

/**
 * Owns the drag context (§2.6, §2.8) — `KanbanColumn`/`TaskCard` stay dumb
 * about dnd-kit. `columns` mirrors the query cache and is updated live
 * during a drag via `onDragOver` (dnd-kit's own cross-container pattern),
 * so a card visibly re-parents before the `/move` response lands (NFR-9);
 * `onMove` fires once, on drop, with the neighbours the server needs for
 * §2.7's midpoint. The parent's refetch then reconciles this local state
 * back to the server's truth — cards stay keyed by task id throughout so
 * React never unmounts/remounts one mid-reconcile, the flicker lesson
 * `TASK-crop-stress` §8 already recorded for its own grouping.
 *
 * `id="tasks-board"` on `DndContext` — found live: without an explicit id,
 * dnd-kit auto-generates one via an internal counter, and every `aria-*`
 * attribute it stamps on each sortable card embeds it. That counter isn't
 * guaranteed to land on the same value during SSR and the client's first
 * render, so the card's `aria-describedby` mismatched (`…-0` vs `…-1`) and
 * React logged a hydration warning on every card. A fixed id removes the
 * only thing that could differ.
 */
export function KanbanBoard({ columns: columnsProp, onTaskClick, onAddTask, onMove }: KanbanBoardProps) {
  // `null` = not dragging, so `columnsProp` (the query cache, refetched
  // after every move) is the source of truth with no mirroring effect
  // needed. A drag starts a working copy here and clears it on drop —
  // avoids the "setState synchronously in an effect" anti-pattern a
  // prop-mirroring `useEffect` would trip.
  const [dragColumns, setDragColumns] = React.useState<KanbanBoardColumn[] | null>(null);
  const [activeTask, setActiveTask] = React.useState<Task | null>(null);
  const columns = dragColumns ?? columnsProp;

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function findColumnStatus(taskId: string): TaskStatus | null {
    return columns.find((c) => c.tasks.some((t) => t.id === taskId))?.status ?? null;
  }

  function handleDragStart(event: DragStartEvent) {
    setDragColumns(columnsProp);
    const task = columnsProp.flatMap((c) => c.tasks).find((t) => t.id === event.active.id) ?? null;
    setActiveTask(task);
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;
    const activeId = active.id as string;
    const overId = over.id as string;
    const fromStatus = findColumnStatus(activeId);
    const toStatus = (taskStatusValues as readonly string[]).includes(overId)
      ? (overId as TaskStatus)
      : findColumnStatus(overId);
    if (!fromStatus || !toStatus || fromStatus === toStatus) return;

    setDragColumns((prevOrNull) => {
      const prev = prevOrNull ?? columnsProp;
      const from = prev.find((c) => c.status === fromStatus)!;
      const to = prev.find((c) => c.status === toStatus)!;
      const task = from.tasks.find((t) => t.id === activeId);
      if (!task) return prev;
      const overIndex = to.tasks.findIndex((t) => t.id === overId);
      const insertAt = overIndex === -1 ? to.tasks.length : overIndex;
      return prev.map((c) => {
        if (c.status === fromStatus) return { ...c, tasks: c.tasks.filter((t) => t.id !== activeId) };
        if (c.status === toStatus) {
          const next = [...c.tasks];
          next.splice(insertAt, 0, task);
          return { ...c, tasks: next };
        }
        return c;
      });
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveTask(null);
    if (!over) {
      setDragColumns(null);
      return;
    }
    const activeId = active.id as string;
    const status = findColumnStatus(activeId);
    if (!status) {
      setDragColumns(null);
      return;
    }

    const column = columns.find((c) => c.status === status)!;
    const index = column.tasks.findIndex((t) => t.id === activeId);
    const beforeId = column.tasks[index - 1]?.id ?? null;
    const afterId = column.tasks[index + 1]?.id ?? null;
    onMove(activeId, { status, beforeId, afterId }, columns);
    setDragColumns(null);
  }

  return (
    <DndContext
      id="tasks-board"
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      {/*
        `items-start`: a flex row's default `align-items: stretch` was
        forcing every column to the *tallest* column's height (found live —
        `To Do`'s 9 cards stretched `Done`'s box far past its own 4 cards,
        which is what made its `+ Add task` button appear to float over
        unrelated space rather than sit right after its own last card).
        Columns must size to their own content — §1.3's "hugs its content,
        never an equal-height grid" is exactly this.
        `min-w-0`: same fix as `PageContainer`'s own two divs — without it
        this row can force its ancestors wider instead of scrolling
        internally, which is what pushed the whole page horizontally and
        hid the sidebar.
      */}
      <div className="flex min-w-0 items-start gap-6 overflow-x-auto">
        {columns.map((column) => (
          <KanbanColumn key={column.status} status={column.status} count={column.tasks.length} onAddTask={onAddTask}>
            <SortableContext items={column.tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
              <DroppableCardList status={column.status}>
                {column.tasks.map((task) => (
                  <SortableTaskCard key={task.id} task={task} onClick={() => onTaskClick(task)} />
                ))}
              </DroppableCardList>
            </SortableContext>
          </KanbanColumn>
        ))}
      </div>
      <DragOverlay>{activeTask ? <TaskCard task={activeTask} /> : null}</DragOverlay>
    </DndContext>
  );
}
