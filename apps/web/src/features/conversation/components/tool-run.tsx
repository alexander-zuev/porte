import {
  BookOpenIcon,
  CaretRightIcon,
  GlobeIcon,
  MagnifyingGlassIcon,
  PencilSimpleIcon,
  TerminalWindowIcon,
  TrashIcon,
  WrenchIcon,
  type Icon,
} from '@phosphor-icons/react'
import type { ToolKind } from '@porte/core/client'
import { ConversationToolOutput } from '@web/features/conversation/components/conversation-tool-output.tsx'
import { describeRun, type ToolCall } from '@web/features/conversation/models/tool-runs.ts'
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from '@web/ui/components/ai-elements/tool.tsx'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@web/ui/components/ui/collapsible.tsx'
import { Drawer, DrawerContent, DrawerTitle, DrawerTrigger } from '@web/ui/components/ui/drawer.tsx'
import { usePhone } from '@web/ui/hooks/use-phone.ts'

/** The kinds a reader meets every turn get a glyph; the rest share one. */
const ICONS = {
  read: BookOpenIcon,
  edit: PencilSimpleIcon,
  delete: TrashIcon,
  search: MagnifyingGlassIcon,
  execute: TerminalWindowIcon,
  fetch: GlobeIcon,
  move: WrenchIcon,
  think: WrenchIcon,
  switch_mode: WrenchIcon,
  other: WrenchIcon,
} satisfies Record<ToolKind, Icon>

/** One call: its row, and what went in and came out under it. */
export function ToolCallRow({ call }: { readonly call: ToolCall }) {
  const { part } = call
  const KindIcon = ICONS[call.kind]
  return (
    <Tool>
      <ToolHeader
        change={call.change}
        icon={<KindIcon aria-hidden />}
        state={part.state}
        title={call.title}
        toolName={part.toolName}
        type={part.type}
      />
      <ToolContent>
        <ToolInput input={part.input} />
        {part.state === 'output-available' ? <ConversationToolOutput output={part.output} /> : null}
        {part.state === 'output-error' ? (
          <ToolOutput errorText={part.errorText} output={undefined} />
        ) : null}
      </ToolContent>
    </Tool>
  )
}

export type ToolRunProps = {
  readonly calls: readonly ToolCall[]
  readonly settled: boolean
}

/**
 * The calls between two things the agent said.
 *
 * Open while any call is still moving, or when there is only one. Once every
 * call has answered, a run of several folds to one line that says what was
 * done; the rows come back on a tap — inline on a desktop, in a sheet on a phone.
 */
export function ToolRun({ calls, settled }: ToolRunProps) {
  const phone = usePhone()
  // One column with no gap: rows are a list, and each row's height is its air.
  const rows = (
    <div className="flex flex-col">
      {calls.map((call) => (
        <ToolCallRow key={call.part.toolCallId} call={call} />
      ))}
    </div>
  )
  if (!settled || calls.length === 1) return rows
  const summary = describeRun(calls)

  if (phone) {
    return (
      <Drawer>
        <DrawerTrigger className={RUN_ROW}>
          <RunLabel summary={summary} />
        </DrawerTrigger>
        <DrawerContent>
          <DrawerTitle className="px-4" render={<h3>{summary}</h3>} />
          <div className="px-4">{rows}</div>
        </DrawerContent>
      </Drawer>
    )
  }

  return (
    <Collapsible className="group not-prose w-full">
      <CollapsibleTrigger className={RUN_ROW}>
        <RunLabel summary={summary} />
        <CaretRightIcon
          aria-hidden
          className="size-3 shrink-0 transition-transform duration-150 ease-out group-data-panel-open:rotate-90 motion-reduce:transition-none"
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="ml-2 border-l pl-4 outline-none">{rows}</CollapsibleContent>
    </Collapsible>
  )
}

/** The same row as one call, so a folded run reads as a call that stands for several. */
const RUN_ROW =
  'group flex min-h-11 w-full items-center gap-2 text-left text-muted-foreground transition-colors duration-150 ease-out hover:text-foreground motion-reduce:transition-none'

function RunLabel({ summary }: { readonly summary: string }) {
  return (
    <>
      <WrenchIcon aria-hidden className="size-4 shrink-0" />
      <span className="min-w-0 truncate">{summary}</span>
    </>
  )
}
