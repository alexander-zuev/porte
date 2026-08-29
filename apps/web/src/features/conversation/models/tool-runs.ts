import { ToolContentSchema, ToolKindSchema, type ToolKind } from '@porte/core/client'
import { isDynamicToolUIPart, type DynamicToolUIPart, type UIMessage } from 'ai'
import { z } from 'zod'

import { spanDiffCounts, type LineChange } from './span-diff.ts'

export type MessagePart = UIMessage['parts'][number]

/** One tool call, read the way a row shows it. */
export type ToolCall = {
  readonly part: DynamicToolUIPart
  readonly kind: ToolKind
  /** Grok's own title once it has sent one (`Edit hello.txt`); the raw tool name before that. */
  readonly title: string
  readonly path: string | undefined
  /** Lines in and out, for an edit that has finished. */
  readonly change: LineChange | undefined
}

/**
 * A message, cut into what is read and what was done.
 *
 * A run is every tool call between two other parts. It is settled when every
 * call in it has answered; a settled run of more than one call folds to a line.
 */
export type Stretch =
  | { readonly type: 'part'; readonly part: MessagePart }
  | { readonly type: 'run'; readonly calls: readonly ToolCall[]; readonly settled: boolean }

const metadataSchema = z.object({
  kind: ToolKindSchema.optional(),
  locations: z.array(z.object({ path: z.string().min(1) })).optional(),
})

const outputSchema = z.object({ content: z.array(ToolContentSchema) })

const SETTLED = new Set<DynamicToolUIPart['state']>([
  'output-available',
  'output-error',
  'output-denied',
])

export function groupParts(parts: readonly MessagePart[]): Stretch[] {
  const stretches: Stretch[] = []
  let calls: ToolCall[] = []
  const flush = () => {
    if (calls.length === 0) return
    stretches.push({
      type: 'run',
      calls,
      settled: calls.every((call) => SETTLED.has(call.part.state)),
    })
    calls = []
  }
  for (const part of parts) {
    if (isDynamicToolUIPart(part)) {
      calls.push(toolCall(part))
      continue
    }
    flush()
    stretches.push({ type: 'part', part })
  }
  flush()
  return stretches
}

export function toolCall(part: DynamicToolUIPart): ToolCall {
  const metadata = metadataSchema.safeParse(part.toolMetadata)
  const kind = metadata.success ? (metadata.data.kind ?? 'other') : 'other'
  const output = part.state === 'output-available' ? outputSchema.safeParse(part.output) : undefined
  const diffs =
    output?.success === true
      ? output.data.content.filter((item) => item.type === 'diff')
      : []
  const change =
    diffs.length === 0
      ? undefined
      : diffs
          .map(spanDiffCounts)
          .reduce((sum, one) => ({ added: sum.added + one.added, removed: sum.removed + one.removed }))
  const location = metadata.success ? metadata.data.locations?.[0]?.path : undefined
  return {
    part,
    kind,
    title: part.title ?? part.toolName,
    path: location ?? diffs[0]?.path,
    change,
  }
}

/** One line for a folded run: `Edited 2 files, read 3 files, ran 1 command`. */
export function describeRun(calls: readonly ToolCall[]): string {
  const files = (kind: ToolKind) =>
    new Set(calls.filter((call) => call.kind === kind).map((call) => call.path ?? call.part.toolCallId))
      .size
  const count = (kind: ToolKind) => calls.filter((call) => call.kind === kind).length
  const known = new Set<ToolKind>(['edit', 'delete', 'move', 'read', 'search', 'fetch', 'execute'])
  const rest = calls.filter((call) => !known.has(call.kind)).length

  const phrases = [
    phrase(files('edit'), 'edited', 'file'),
    phrase(files('delete'), 'deleted', 'file'),
    phrase(files('move'), 'moved', 'file'),
    phrase(files('read'), 'read', 'file'),
    phrase(count('search'), 'ran', 'search', 'searches'),
    phrase(files('fetch'), 'fetched', 'page'),
    phrase(count('execute'), 'ran', 'command'),
    phrase(rest, 'made', 'other call'),
  ].filter((one) => one !== '')
  const line = phrases.join(', ')
  return line.charAt(0).toUpperCase() + line.slice(1)
}

function phrase(n: number, verb: string, one: string, many = `${one}s`): string {
  if (n === 0) return ''
  return `${verb} ${String(n)} ${n === 1 ? one : many}`
}
