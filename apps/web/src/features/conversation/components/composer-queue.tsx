import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ArrowUpIcon, ClockCountdownIcon, DotsSixVerticalIcon, XIcon } from '@phosphor-icons/react'
import { MessageIdSchema, type MessageId } from '@porte/core/client'
import type {
  QueueActions,
  QueuedMessage,
} from '@web/features/conversation/models/message-queue.ts'
import { cn } from '@web/lib/utils.ts'
import { Button } from '@web/ui/components/ui/button.tsx'
import { Drawer, DrawerContent, DrawerTrigger } from '@web/ui/components/ui/drawer.tsx'
import { useState } from 'react'

import { ComposerSheetBody } from './composer-rows.tsx'
import { SHEET_PANEL, SheetHeader } from './tool-run.tsx'

export type ComposerQueueProps = {
  /** Run order. Empty is a state, never undefined: the pill is simply not drawn. */
  readonly queued: readonly QueuedMessage[]
  readonly actions: QueueActions
  /** Story-only: open the sheet on first paint. */
  readonly defaultOpen?: boolean
}

/**
 * The queue pill above the composer and the sheet behind it.
 *
 * One surface on every device: the pill says how many wait, the sheet lists
 * them in run order with drag, Send now, and Remove. A tap on the words pushes
 * the whole message in from the right, the way a tool run opens its detail.
 * Nothing here is drawn inside the transcript; a queued message joins it only
 * when it starts.
 */
export function ComposerQueue({ queued, actions, defaultOpen = false }: ComposerQueueProps) {
  const [open, setOpen] = useState(defaultOpen)
  const [selectedId, setSelectedId] = useState<MessageId | null>(null)
  // The sheet can be open when the last row starts. Forget that, or the next queued
  // message would mount the drawer open again.
  if (queued.length === 0 && open) {
    setOpen(false)
    setSelectedId(null)
  }
  if (queued.length === 0) return null
  const count = String(queued.length)
  // A message that started or was removed while its page was open falls back to the list.
  const selected = queued.find((message) => message.id === selectedId) ?? null

  // The parent's strip places the pill; the drawer root draws nothing of its own.
  return (
    <Drawer
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setSelectedId(null)
      }}
    >
      <DrawerTrigger
        render={<Button aria-label={`${count} queued, open queue`} size="sm" variant="outline" />}
      >
        <ClockCountdownIcon aria-hidden className="text-muted-foreground" />
        <span className="tabular-nums">{count}</span>
      </DrawerTrigger>
      <DrawerContent>
        <SheetHeader
          title={selected === null ? 'Queue' : `#${String(selected.position)}`}
          onBack={
            selected === null
              ? undefined
              : () => {
                  setSelectedId(null)
                }
          }
        />
        {/* One fixed frame; the message page slides in from the right, iOS-style. */}
        <ComposerSheetBody className="relative overflow-hidden px-0 pt-0">
          <div
            inert={selected !== null}
            className={cn(SHEET_PANEL, 'pt-3', selected !== null && '-translate-x-1/3')}
          >
            <QueueList actions={actions} queued={queued} onOpen={setSelectedId} />
          </div>
          <div
            inert={selected === null}
            className={cn(SHEET_PANEL, 'pt-3', selected === null && 'translate-x-full')}
          >
            {selected === null ? null : (
              <p className="whitespace-pre-wrap">
                {selected.text}
                {selected.files > 0 ? (
                  <span className="text-muted-foreground"> · {String(selected.files)} file</span>
                ) : null}
              </p>
            )}
          </div>
        </ComposerSheetBody>
      </DrawerContent>
    </Drawer>
  )
}

/** The rows, sortable by their handle with a pointer or the keyboard (space, arrows, space). */
function QueueList({
  queued,
  actions,
  onOpen,
}: {
  readonly queued: readonly QueuedMessage[]
  readonly actions: QueueActions
  readonly onOpen: (id: MessageId) => void
}) {
  const sensors = useSensors(
    // A few pixels of travel first, so a tap on the handle is not a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (over === null || active.id === over.id) return
    const target = queued.findIndex((message) => message.id === over.id)
    if (target === -1) return
    actions.reorder(MessageIdSchema.parse(active.id), target + 1)
  }

  return (
    <DndContext collisionDetection={closestCenter} sensors={sensors} onDragEnd={onDragEnd}>
      <SortableContext items={queued.map((m) => m.id)} strategy={verticalListSortingStrategy}>
        <ol className="flex flex-col gap-2">
          {queued.map((message) => (
            <QueueRow key={message.id} actions={actions} message={message} onOpen={onOpen} />
          ))}
        </ol>
      </SortableContext>
    </DndContext>
  )
}

function QueueRow({
  message,
  actions,
  onOpen,
}: {
  readonly message: QueuedMessage
  readonly actions: QueueActions
  readonly onOpen: (id: MessageId) => void
}) {
  const {
    attributes,
    isDragging,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: message.id })

  return (
    <li
      ref={setNodeRef}
      className={cn(
        'flex items-center gap-2 rounded-xl bg-secondary px-2 py-2',
        isDragging && 'relative z-10 shadow-lg',
      )}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <Button
        ref={setActivatorNodeRef}
        aria-label={`Move #${String(message.position)}`}
        className="cursor-grab touch-none text-muted-foreground active:cursor-grabbing"
        size="icon-sm"
        variant="ghost"
        {...attributes}
        {...listeners}
      >
        <DotsSixVerticalIcon aria-hidden className="size-5" />
      </Button>
      <span className="w-6 shrink-0 text-muted-foreground tabular-nums">
        #{String(message.position)}
      </span>
      {/* The words are the tap target: they open the whole message. No chevron, it would promise more than a tap. */}
      <Button
        className="h-auto min-w-0 flex-1 justify-start px-1 py-1 text-left"
        size="sm"
        variant="ghost"
        onClick={() => {
          onOpen(message.id)
        }}
      >
        <span className="min-w-0 flex-1 truncate">
          {message.text}
          {message.files > 0 ? (
            <span className="text-muted-foreground"> · {String(message.files)} file</span>
          ) : null}
        </span>
      </Button>
      <Button
        aria-label="Send now"
        size="icon-xs"
        variant="outline"
        onClick={() => {
          actions.sendNow(message.id)
        }}
      >
        <ArrowUpIcon aria-hidden weight="bold" />
      </Button>
      <Button
        aria-label="Remove"
        size="icon-xs"
        variant="outline"
        onClick={() => {
          actions.remove(message.id)
        }}
      >
        <XIcon aria-hidden />
      </Button>
    </li>
  )
}
