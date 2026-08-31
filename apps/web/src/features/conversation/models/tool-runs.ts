import { ToolContentSchema, ToolKindSchema, type ToolKind } from '@porte/core/client'
import {
  getToolName,
  isReasoningUIPart,
  isTextUIPart,
  isToolUIPart,
  type DynamicToolUIPart,
  type ReasoningUIPart,
  type ToolUIPart,
  type UIMessage,
} from 'ai'
import { z } from 'zod'

import { spanDiffCounts, type LineChange, type SpanDiff } from './span-diff.ts'

export type MessagePart = UIMessage['parts'][number]

/**
 * A tool call in either shape the SDK builds. The sender's stream makes
 * `dynamic-tool`; a second client watching the same turn gets `tool-<name>`
 * from the agents library, which ignores `dynamic`. Same fields, one row.
 */
export type ToolPart = DynamicToolUIPart | ToolUIPart

/** One tool call, read the way a row shows it. */
export type ToolCall = {
  readonly part: ToolPart
  readonly kind: ToolKind
  /** Grok's own title once it has sent one (`Edit hello.txt`); the raw tool name before that. */
  readonly title: string
  /** The raw tool name, e.g. `run_terminal_command`. */
  readonly name: string
  /** The agent's `_meta` for this call, when it sent one. */
  readonly meta: unknown
  readonly path: string | undefined
  /** The span diffs of an edit that answered. Empty otherwise. */
  readonly diffs: readonly SpanDiff[]
  /** Lines in and out, for an edit that has finished. */
  readonly change: LineChange | undefined
}

/**
 * A message, cut into what is read and what was done.
 *
 * A run is every tool call between two other parts. It is settled when every
 * call in it has answered; a settled run of more than one call folds to a line.
 * A run straight after a reasoning part belongs to that thought: on a phone
 * the thought's sheet shows the calls under the text.
 */
export type Stretch =
  | { readonly type: 'part'; readonly part: MessagePart }
  | { readonly type: 'run'; readonly calls: readonly ToolCall[]; readonly settled: boolean }
  | {
      readonly type: 'thought'
      readonly part: ReasoningUIPart
      readonly calls: readonly ToolCall[]
      readonly settled: boolean
    }

const metadataSchema = z.object({
  kind: ToolKindSchema.optional(),
  locations: z.array(z.object({ path: z.string().min(1) })).optional(),
  _meta: z.unknown().optional(),
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
    const settled = calls.every((call) => SETTLED.has(call.part.state))
    const previous = stretches.at(-1)
    if (previous?.type === 'part' && isReasoningUIPart(previous.part)) {
      stretches[stretches.length - 1] = { type: 'thought', part: previous.part, calls, settled }
    } else {
      stretches.push({ type: 'run', calls, settled })
    }
    calls = []
  }
  for (const part of parts) {
    if (isToolUIPart(part)) {
      calls.push(toolCall(part))
      continue
    }
    flush()
    stretches.push({ type: 'part', part })
  }
  flush()
  return stretches
}

export function toolCall(part: ToolPart): ToolCall {
  const metadata = metadataSchema.safeParse(part.toolMetadata)
  const kind = metadata.success ? (metadata.data.kind ?? 'other') : 'other'
  const output = part.state === 'output-available' ? outputSchema.safeParse(part.output) : undefined
  const diffs =
    output?.success === true ? output.data.content.filter((item) => item.type === 'diff') : []
  const change =
    diffs.length === 0
      ? undefined
      : diffs.map(spanDiffCounts).reduce((sum, one) => ({
          added: sum.added + one.added,
          removed: sum.removed + one.removed,
        }))
  const location = metadata.success ? metadata.data.locations?.[0]?.path : undefined
  return {
    part,
    kind,
    title: part.title ?? getToolName(part),
    name: getToolName(part),
    meta: metadata.success ? metadata.data._meta : undefined,
    path: location ?? diffs[0]?.path,
    diffs,
    change,
  }
}

/** Nothing in the message is still arriving: no text streaming, no call moving. */
export function messageSettled(message: UIMessage): boolean {
  return message.parts.every((part) => {
    if (isTextUIPart(part) || isReasoningUIPart(part)) return part.state !== 'streaming'
    if (isToolUIPart(part)) return SETTLED.has(part.state)
    return true
  })
}

/** The words of an answer, for the clipboard: text parts only, in order. */
export function messageText(message: UIMessage): string {
  return message.parts
    .filter(isTextUIPart)
    .map((part) => part.text)
    .join('\n\n')
}

/** One line for a folded run: `Edited 2 files, read 3 files, ran 1 command`. */
export function describeRun(calls: readonly ToolCall[]): string {
  const files = (kind: ToolKind) =>
    new Set(
      calls.filter((call) => call.kind === kind).map((call) => call.path ?? call.part.toolCallId),
    ).size
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
