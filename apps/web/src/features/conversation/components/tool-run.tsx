import {
  BookOpenIcon,
  CaretLeftIcon,
  CaretRightIcon,
  FolderSimpleIcon,
  GlobeIcon,
  MagnifyingGlassIcon,
  PencilSimpleIcon,
  TerminalWindowIcon,
  TrashIcon,
  WrenchIcon,
  type Icon,
} from '@phosphor-icons/react'
import { ToolDetail } from '@web/features/conversation/components/tool-detail.tsx'
import { describeRun, type ToolCall } from '@web/features/conversation/models/tool-runs.ts'
import {
  runChanges,
  toolCallView,
  type ToolCallView,
  type ToolIcon,
} from '@web/features/conversation/models/tool-view.ts'
import { cn } from '@web/lib/utils.ts'
import { ToolRowButton, toolRowClass } from '@web/ui/components/ai-elements/tool-output.tsx'
import { Button } from '@web/ui/components/ui/button.tsx'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@web/ui/components/ui/collapsible.tsx'
import {
  Drawer,
  DrawerBody,
  DrawerCloseButton,
  DrawerContent,
  DrawerTitle,
  DrawerTrigger,
} from '@web/ui/components/ui/drawer.tsx'
import { usePhone } from '@web/ui/hooks/use-phone.ts'
import { useState, type ReactNode } from 'react'

/** The kinds a reader meets every turn get a glyph; the rest share one. */
const ICONS = {
  read: BookOpenIcon,
  edit: PencilSimpleIcon,
  delete: TrashIcon,
  search: MagnifyingGlassIcon,
  execute: TerminalWindowIcon,
  fetch: GlobeIcon,
  list: FolderSimpleIcon,
  move: WrenchIcon,
  think: WrenchIcon,
  switch_mode: WrenchIcon,
  other: WrenchIcon,
} satisfies Record<ToolIcon, Icon>

type ToolState = ToolCall['part']['state']

const STATUS_LABELS = {
  'approval-requested': 'Awaiting approval',
  'approval-responded': 'Responded',
  'input-available': 'Running',
  'input-streaming': 'Pending',
  'output-available': 'Completed',
  'output-denied': 'Denied',
  'output-error': 'Error',
} satisfies Record<ToolState, string>

/**
 * One dot, not seven words: a call is idle, working, done, or broken.
 * Only a call still moving blinks, so motion on the screen always means work
 * in flight.
 */
const STATUS_DOTS = {
  'approval-requested': 'bg-muted-foreground animate-pulse',
  'approval-responded': 'bg-muted-foreground',
  'input-available': 'bg-muted-foreground animate-pulse',
  'input-streaming': 'bg-border',
  'output-available': 'bg-status-success',
  'output-denied': 'bg-destructive',
  'output-error': 'bg-destructive',
} satisfies Record<ToolState, string>

/** A call still moving keeps the dot, whatever icon its kind has. */
const MOVING = new Set<ToolState>(['approval-requested', 'input-available', 'input-streaming'])

function RowGlyph({ call, view }: { readonly call: ToolCall; readonly view: ToolCallView }) {
  const state = call.part.state
  if (MOVING.has(state)) {
    return (
      <span className="flex size-4 shrink-0 items-center justify-center">
        <span aria-hidden className={cn('size-2 rounded-full', STATUS_DOTS[state])} />
        <span className="sr-only">{STATUS_LABELS[state]}</span>
      </span>
    )
  }
  const KindIcon = ICONS[view.icon]
  const failed = state === 'output-error' || state === 'output-denied'
  return (
    <span
      className={cn(
        'flex size-4 shrink-0 items-center justify-center [&_svg]:size-4',
        failed && 'text-destructive-muted-foreground',
      )}
    >
      <KindIcon aria-hidden />
      <span className="sr-only">{STATUS_LABELS[state]}</span>
    </span>
  )
}

/** `Edited` muted, the file bright and mono, the counts in their colours. */
function RowWords({ view }: { readonly view: ToolCallView }) {
  return (
    <>
      <span className="min-w-0 truncate">
        {view.verb === '' ? null : <>{view.verb} </>}
        <span className={cn(view.code && 'font-mono text-foreground')}>{view.subject}</span>
      </span>
      {view.change === undefined ? null : <ChangeCount change={view.change} />}
    </>
  )
}

function ChangeCount({ change }: { readonly change: { added: number; removed: number } }) {
  return (
    <small className="shrink-0 font-mono">
      <span className="text-status-success-muted-foreground">+{change.added}</span>{' '}
      <span className="text-destructive-muted-foreground">−{change.removed}</span>
    </small>
  )
}

function Chevron() {
  return (
    <CaretRightIcon
      aria-hidden
      className="size-3 shrink-0 transition-transform duration-150 ease-out group-data-panel-open:rotate-90 motion-reduce:transition-none"
    />
  )
}

// ---------------------------------------------------------------------------
// Phone: every row opens a sheet; nothing in the transcript expands in place.

/** The sheet header: close or back on the left, the bold name centred. */
export function SheetHeader({
  title,
  onBack,
}: {
  readonly title: string
  readonly onBack?: (() => void) | undefined
}) {
  return (
    <div className="grid min-h-12 grid-cols-[3rem_1fr_3rem] items-center px-4">
      {onBack === undefined ? (
        <DrawerCloseButton />
      ) : (
        <Button
          aria-label="Back"
          className="size-11 rounded-full bg-secondary"
          size="icon"
          variant="ghost"
          onClick={onBack}
        >
          <CaretLeftIcon aria-hidden className="size-5" />
        </Button>
      )}
      <DrawerTitle className="min-w-0 text-center" render={<h3 className="truncate">{title}</h3>} />
    </div>
  )
}

/** One call in a sheet of its own: the detail is the whole body. */
function CallSheet({ call, children }: { readonly call: ToolCall; readonly children: ReactNode }) {
  const view = toolCallView(call)
  return (
    <Drawer>
      <DrawerTrigger className={toolRowClass}>{children}</DrawerTrigger>
      <DrawerContent>
        <SheetHeader title={view.label} />
        <DrawerBody>
          <ToolDetail call={call} />
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  )
}

/**
 * The two sheet pages ride one fixed frame; only transform moves, the iOS way.
 * Each page paints the sheet surface, so the incoming one covers the outgoing.
 */
export const SHEET_PANEL =
  'absolute inset-0 overflow-y-auto overscroll-contain bg-surface px-4 transition-transform duration-300 ease-out motion-reduce:transition-none'

/**
 * A folded run's sheet: the calls as a list, and a tap pushes one call's
 * detail in from the right, iOS-style — the sheet itself never moves or
 * resizes. Back returns to the list; close is only at the top.
 */
export function RunSheetBody({
  calls,
  summary,
}: {
  readonly calls: readonly ToolCall[]
  readonly summary: string
}) {
  const [selected, setSelected] = useState<ToolCall | null>(null)
  const view = selected === null ? null : toolCallView(selected)
  return (
    <>
      <SheetHeader
        title={view === null ? summary : view.label}
        onBack={
          view === null
            ? undefined
            : () => {
                setSelected(null)
              }
        }
      />
      <DrawerBody className="relative overflow-hidden px-0 pt-0">
        <div
          inert={selected !== null}
          className={cn(SHEET_PANEL, 'flex flex-col', selected !== null && '-translate-x-1/3')}
        >
          {calls.map((call) => {
            const rowView = toolCallView(call)
            return (
              <ToolRowButton
                key={call.part.toolCallId}
                onClick={() => {
                  setSelected(call)
                }}
              >
                <RowGlyph call={call} view={rowView} />
                <RowWords view={rowView} />
                <Chevron />
              </ToolRowButton>
            )
          })}
        </div>
        <div
          inert={selected === null}
          className={cn(SHEET_PANEL, 'pt-3', selected === null && 'translate-x-full')}
        >
          {selected === null ? null : <ToolDetail call={selected} />}
        </div>
      </DrawerBody>
    </>
  )
}

/**
 * One call, the way the agent's own client shows it: a sheet on a phone —
 * nothing expands in place there — and unfolding under the row on a desktop.
 */
export function ToolCallRow({
  call,
  className,
}: {
  readonly call: ToolCall
  readonly className?: string
}) {
  const phone = usePhone()
  const view = toolCallView(call)
  if (phone) {
    return (
      <CallSheet call={call}>
        <RowGlyph call={call} view={view} />
        <RowWords view={view} />
        <Chevron />
      </CallSheet>
    )
  }
  // No rail down the side: the detail hangs under its row, and every long
  // block caps and scrolls itself, so opening never jumps the page.
  return (
    <Collapsible className={cn('group not-prose w-full', className)}>
      <CollapsibleTrigger className={toolRowClass}>
        <RowGlyph call={call} view={view} />
        <RowWords view={view} />
        <Chevron />
      </CollapsibleTrigger>
      <CollapsibleContent className="pb-3 outline-none">
        <ToolDetail call={call} variant="inline" />
      </CollapsibleContent>
    </Collapsible>
  )
}

export type ToolRunProps = {
  readonly calls: readonly ToolCall[]
  readonly settled: boolean
}

/**
 * The calls between two things the agent said.
 *
 * While calls are still moving every call keeps its own row, so the reader
 * watches the work land. Once every call has answered, a run of several folds
 * to one line saying what was done; the line opens a sheet on a phone and
 * unfolds in place on a desktop.
 */
export function ToolRun({ calls, settled }: ToolRunProps) {
  const phone = usePhone()
  if (!settled || calls.length === 1) {
    return (
      <div className="flex flex-col">
        {calls.map((call) => (
          <ToolCallRow key={call.part.toolCallId} call={call} />
        ))}
      </div>
    )
  }
  const summary = describeRun(calls)
  const change = runChanges(calls)
  const label = (
    <>
      <WrenchIcon aria-hidden className="size-4 shrink-0" />
      <span className="min-w-0 truncate">{summary}</span>
      {change === undefined ? null : <ChangeCount change={change} />}
      <Chevron />
    </>
  )

  if (phone) {
    return (
      <Drawer>
        <DrawerTrigger className={toolRowClass}>{label}</DrawerTrigger>
        <DrawerContent>
          <RunSheetBody calls={calls} summary={summary} />
        </DrawerContent>
      </Drawer>
    )
  }

  // A card, not a rail: the opened run is a bordered list with a hairline
  // between calls, each row unfolding its own detail inside its cell.
  return (
    <Collapsible className="group not-prose w-full">
      <CollapsibleTrigger className={toolRowClass}>{label}</CollapsibleTrigger>
      <CollapsibleContent className="outline-none">
        <div className="divide-y rounded-xl border">
          {calls.map((call) => (
            <ToolCallRow key={call.part.toolCallId} className="px-4" call={call} />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
