/**
 * Calendar direct manipulation (03-UX §5): one drag system for mouse and touch in Day and Month.
 *
 * - Mouse drags after 6px, so a click still selects. Touch drags after a 350 ms long-press, so a tap
 *   still selects and a swipe still scrolls.
 * - The dragged entry floats under the pointer; the original stays faded in place, so grids never
 *   reflow. Drop targets highlight only when the drop is valid (lib/calendarMove).
 * - Nothing is written until a valid drop: a drop elsewhere, Escape or a cancelled touch changes
 *   nothing. The click that follows a drop never opens or completes anything.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  useDndContext,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import type { ActivityTileItem } from '@/components/calendar/ActivityTile'
import { canDropOnTarget, type CalendarDropTarget } from '@/lib/calendarMove'
import { canMoveCalendarEntry } from '@/lib/calendarGrouping'
import { dateLabel } from '@/lib/dates'
import { formatTargetTime } from '@/lib/targetTime'
import { resolveActivityCategory } from '@/lib/activityCategory'

type DragData = { item: ActivityTileItem }
type DropData = { target: CalendarDropTarget }

const CalendarDndConfig = createContext<{ enabled: boolean; todayIso: string }>({ enabled: false, todayIso: '' })

export const targetLabel = (target: CalendarDropTarget, keepTime?: string | null) => {
  const date = dateLabel(target.date, { weekday: 'short', month: 'short', day: 'numeric' })
  const time = target.time === undefined ? keepTime : target.time
  return `${date} · ${formatTargetTime(time ?? null) ?? 'Any time'}`
}

export function CalendarDndProvider({
  enabled,
  todayIso,
  onMove,
  children,
}: {
  /** Off while offline or before data loads: entries are not draggable at all. */
  enabled: boolean
  todayIso: string
  onMove: (itemId: string, target: CalendarDropTarget) => void
  children: ReactNode
}) {
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 350, tolerance: 8 } }),
  )
  const [active, setActive] = useState<ActivityTileItem | null>(null)
  const suppressClickUntil = useRef(0)

  // The click a mouse drop generates (on whatever is under the pointer) is swallowed, once and only
  // within a moment of the drop; a deliberate click right after (Cancel, Remove) still works.
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (Date.now() < suppressClickUntil.current) {
        suppressClickUntil.current = 0
        event.stopPropagation()
        event.preventDefault()
      }
    }
    window.addEventListener('click', onClick, true)
    return () => window.removeEventListener('click', onClick, true)
  }, [])

  const end = useCallback(() => {
    setActive(null)
    suppressClickUntil.current = Date.now() + 50
  }, [])

  const onDragStart = (event: DragStartEvent) => {
    const item = (event.active.data.current as DragData | undefined)?.item ?? null
    setActive(item)
    // A short tick confirms the long-press on phones that support it.
    if ('touches' in event.activatorEvent) navigator.vibrate?.(12)
  }

  const onDragEnd = (event: DragEndEvent) => {
    const item = (event.active.data.current as DragData | undefined)?.item
    const target = (event.over?.data.current as DropData | undefined)?.target
    end()
    if (item && target && canDropOnTarget(item, target, todayIso)) onMove(item.id, target)
  }

  const config = useMemo(() => ({ enabled, todayIso }), [enabled, todayIso])

  return (
    <CalendarDndConfig.Provider value={config}>
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={end}
        accessibility={{
          screenReaderInstructions: {
            draggable:
              'Press and hold, or drag with a mouse, to move this entry to another date or time. Use Move to date in the entry details from the keyboard.',
          },
          announcements: {
            onDragStart: ({ active: a }) => `Picked up ${(a.data.current as DragData | undefined)?.item.title ?? 'entry'}.`,
            onDragOver: ({ over }) => {
              const target = (over?.data.current as DropData | undefined)?.target
              return target ? `Over ${targetLabel(target)}.` : 'Not over a date.'
            },
            onDragEnd: ({ over }) => {
              const target = (over?.data.current as DropData | undefined)?.target
              return target ? `Dropped on ${targetLabel(target)}.` : 'Dropped. Nothing moved.'
            },
            onDragCancel: () => 'Move cancelled. Nothing moved.',
          },
        }}
      >
        {children}
        <DragOverlay dropAnimation={null}>{active ? <DragPreview item={active} /> : null}</DragOverlay>
      </DndContext>
    </CalendarDndConfig.Provider>
  )
}

function DragPreview({ item }: { item: ActivityTileItem }) {
  const category = resolveActivityCategory(item.title, item.programTitle ?? '', item.category)
  return (
    <div className="calendar-tile calendar-chip calendar-drag-preview" data-category={category}>
      <span className="calendar-chip__trigger">
        <span className="calendar-chip__text">
          {item.localTime && <span className="calendar-chip__time">{formatTargetTime(item.localTime)}</span>}
          <span className="calendar-chip__title">{item.title}</span>
        </span>
      </span>
    </div>
  )
}

/** Make an entry draggable when it can move and dragging is enabled. */
export function useCalendarDraggable(item: ActivityTileItem, wanted: boolean) {
  const { enabled } = useContext(CalendarDndConfig)
  const movable = wanted && canMoveCalendarEntry(item)
  const { setNodeRef, listeners, isDragging } = useDraggable({
    id: `entry:${item.id}`,
    data: { item } satisfies DragData,
    disabled: !enabled || !movable,
  })
  return { setNodeRef, listeners: enabled && movable ? listeners : undefined, isDragging, movable: enabled && movable }
}

/** A drop target. `valid` is true only while a draggable that may land here hovers it. */
export function useCalendarDrop(id: string, target: CalendarDropTarget) {
  const { enabled, todayIso } = useContext(CalendarDndConfig)
  const { active } = useDndContext()
  const dragged = (active?.data.current as DragData | undefined)?.item ?? null
  const allowed = Boolean(dragged) && canDropOnTarget(dragged!, target, todayIso)
  const { setNodeRef, isOver } = useDroppable({ id, data: { target } satisfies DropData, disabled: !enabled })
  return {
    setNodeRef,
    dragging: dragged,
    /** Pointer is over this target and the drop would be valid. */
    valid: isOver && allowed,
    /** Pointer is over this target but it would refuse the drop. */
    refused: isOver && Boolean(dragged) && !allowed,
  }
}
