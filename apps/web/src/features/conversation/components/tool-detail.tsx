/* oxlint-disable eslint(no-underscore-dangle) -- ACP requires the exact `_meta` boundary name. */
import { fileName } from '@web/features/conversation/models/span-diff.ts'
import type { SpanDiff } from '@web/features/conversation/models/span-diff.ts'
import type { ToolCall } from '@web/features/conversation/models/tool-runs.ts'
import { toolCallView, type ToolCallView } from '@web/features/conversation/models/tool-view.ts'
import {
  DiffBlock,
  MonoBox,
  PlainOutput,
  type DiffRow,
} from '@web/ui/components/ai-elements/tool-output.tsx'
import { Button } from '@web/ui/components/ui/button.tsx'
import { useState } from 'react'
import { z } from 'zod'

/** Where the detail sits: a phone sheet keeps labeled boxes; inline on a desktop reads like a terminal. */
export type ToolDetailVariant = 'sheet' | 'inline'

/**
 * One call's detail: at most two labeled fields, no JSON.
 *
 * The shape mirrors what the agent's own client shows — `Command`/`Output` for
 * a run, `Pattern`/`Output` for a search, `File` and a diff for an edit, the
 * numbered file for a read. A tool with an empty input shows only its output.
 */
export function ToolDetail({
  call,
  variant = 'sheet',
}: {
  readonly call: ToolCall
  readonly variant?: ToolDetailVariant
}) {
  const view = toolCallView(call)

  // A read is its file: the name is the header, and the body needs no label.
  if (call.kind === 'read' && view.field !== undefined) {
    return (
      <div className="flex flex-col gap-2">
        <small className="font-mono text-muted-foreground">{fileName(view.field.value)}</small>
        <ToolDetailOutput view={view} variant={variant} bare />
      </div>
    )
  }

  // Inline, a command is a `$` pill and needs no label: the shape says what it is.
  const pill = variant === 'inline' && view.field?.name === 'Command'
  return (
    <div className="flex flex-col gap-3">
      {view.field === undefined ? null : pill ? (
        <MonoBox>{`$ ${view.field.value}`}</MonoBox>
      ) : (
        <div className="flex flex-col gap-2">
          <small className="text-muted-foreground">{view.field.name}</small>
          <MonoBox>{view.field.value}</MonoBox>
        </div>
      )}
      <ToolDetailOutput view={view} variant={variant} bare={pill} />
    </div>
  )
}

function ToolDetailOutput({
  view,
  variant,
  bare,
}: {
  readonly view: ToolCallView
  readonly variant: ToolDetailVariant
  readonly bare?: boolean
}) {
  const { output } = view
  if (output.type === 'pending') return null
  if (output.type === 'empty') {
    return <small className="text-muted-foreground">No output</small>
  }
  const label = bare === true ? null : <small className="text-muted-foreground">Output</small>
  if (output.type === 'error') {
    return (
      <div className="flex flex-col gap-2">
        {label}
        <MonoBox className="text-destructive-muted-foreground">{output.text}</MonoBox>
      </div>
    )
  }
  if (output.type === 'json') return <JsonOutput value={output.value} />
  return (
    <div className="flex flex-col gap-2">
      {label}
      {output.type === 'text' ? (
        variant === 'inline' ? (
          <PlainOutput>{output.text}</PlainOutput>
        ) : (
          <MonoBox>{output.text}</MonoBox>
        )
      ) : (
        <div
          className={
            variant === 'inline'
              ? 'flex max-h-96 flex-col gap-2 overflow-y-auto overscroll-contain'
              : 'flex flex-col gap-2'
          }
        >
          {output.diffs.map((diff) => (
            <SpanDiffBlock
              key={`${diff.path}:${diffKey(diff)}`}
              diff={diff}
              named={output.diffs.length > 1}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/** Machine output. Compact as it came; `Prettify` re-indents it in place. */
function JsonOutput({ value }: { readonly value: unknown }) {
  const [pretty, setPretty] = useState(false)
  const text = JSON.stringify(value, null, pretty ? 2 : undefined)
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <small className="text-muted-foreground">Output</small>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setPretty((one) => !one)
          }}
        >
          {pretty ? 'Compact' : 'Prettify'}
        </Button>
      </div>
      <MonoBox>{text}</MonoBox>
    </div>
  )
}

/** Grok puts the line the span starts on in `_meta`. */
const positionSchema = z.object({
  old_line: z.number().int().positive(),
  new_line: z.number().int().positive(),
})

function splitLines(text: string): string[] {
  if (text === '') return []
  return text.replace(/\n$/, '').split('\n')
}

/** Where the span starts, for a stable list key beside its path. */
function diffKey(diff: SpanDiff): string {
  const position = positionSchema.safeParse(diff._meta)
  return position.success ? String(position.data.new_line) : '0'
}

function diffRows(diff: SpanDiff): DiffRow[] {
  const position = positionSchema.safeParse(diff._meta)
  const removed = splitLines(diff.oldText ?? '')
  const added = splitLines(diff.newText)
  // A span with no position starts at 1: a created file really does, and an
  // edit is still more readable numbered than bare.
  const oldStart = position.success ? position.data.old_line : 1
  const newStart = position.success ? position.data.new_line : 1
  return [
    ...removed.map((text, index) => ({
      key: `-${String(index)}`,
      sign: 'removed' as const,
      line: oldStart + index,
      text,
    })),
    ...added.map((text, index) => ({
      key: `+${String(index)}`,
      sign: 'added' as const,
      line: newStart + index,
      text,
    })),
  ]
}

/** One span diff of an edit, rendered through the shared diff block. */
export function SpanDiffBlock({
  diff,
  named,
}: {
  readonly diff: SpanDiff
  readonly named?: boolean
}) {
  return (
    <DiffBlock rows={diffRows(diff)} title={named === true ? fileName(diff.path) : undefined} />
  )
}
