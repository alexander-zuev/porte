import type { ToolKind } from '@porte/core/client'
/* oxlint-disable eslint(no-underscore-dangle) -- ACP requires the exact `_meta` boundary name. */
import { z } from 'zod'

import { spanDiffCounts, type LineChange, type SpanDiff } from './span-diff.ts'
import type { ToolCall } from './tool-runs.ts'

/**
 * How one tool call is presented: the words on its row and the fields in its
 * sheet. Everything here is derived from the raw ACP part, so this module is
 * the one place that knows Grok's input shapes.
 */

/**
 * Grok's per-tool metadata under `_meta["x.ai/tool"]`.
 *
 * On live calls this carries the input too — `rawInput` is usually an empty
 * object until replay — so `input` here is the primary input source.
 */
const agentToolMetaSchema = z.object({
  'x.ai/tool': z
    .object({
      label: z.string().min(1).optional(),
      name: z.string().min(1).optional(),
      input: z.record(z.string(), z.json()).optional(),
    })
    .loose(),
})

function agentMeta(call: ToolCall) {
  const meta = agentToolMetaSchema.safeParse(call.meta)
  return meta.success ? meta.data['x.ai/tool'] : undefined
}

/** A tool input that carries at least one field, as the schemas below read it. */
type ToolInput = z.infer<typeof filledInputSchema>

/** The call's input, wherever it survived: the part, then the agent's `_meta`. */
function callInput(call: ToolCall): ToolInput | undefined {
  const own = filledInputSchema.safeParse(call.part.input)
  if (own.success) return own.data
  return agentMeta(call)?.input
}

const executeInputSchema = z.object({
  command: z.string().min(1),
  description: z.string().min(1).optional(),
})

const searchInputSchema = z.object({ pattern: z.string().min(1) })

const fetchInputSchema = z.object({ url: z.string().min(1) })

const listInputSchema = z.object({ directory: z.string().min(1) })

const readInputSchema = z.object({ target_file: z.string().min(1) })

/** An input worth a sheet field: an object with at least one key. */
const filledInputSchema = z
  .record(z.string(), z.json())
  .refine((value) => Object.keys(value).length > 0)

/** The one labeled input field a sheet shows, e.g. `Command` → `git diff`. */
export type ToolField = { readonly name: string; readonly value: string }

/** What a call's detail view renders under its input field. */
export type ToolOutputView =
  | { readonly type: 'pending' }
  | { readonly type: 'error'; readonly text: string }
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'diffs'; readonly diffs: readonly SpanDiff[] }
  | { readonly type: 'json'; readonly value: unknown }
  | { readonly type: 'empty' }

/** The glyph a row wears: its ACP kind, or a shape the kind hides (a directory listing). */
export type ToolIcon = ToolKind | 'list'

/** One call, resolved to everything a row and a sheet print. */
export type ToolCallView = {
  /** Sheet header: Grok's label ("Run Command") or the humanized tool name. */
  readonly label: string
  readonly icon: ToolIcon
  /** Row line: verb + subject, e.g. `Ran` + `Show working tree status`. */
  readonly verb: string
  /** What follows the verb. Monospace when `code` is true. */
  readonly subject: string
  readonly code: boolean
  /** Lines in and out, when the call changed a file. */
  readonly change: LineChange | undefined
  /** The labeled input field, or none when the input carries nothing to show. */
  readonly field: ToolField | undefined
  readonly output: ToolOutputView
}

const outputTextSchema = z.object({
  content: z.array(
    z
      .object({
        type: z.literal('content'),
        content: z.object({ type: z.literal('text'), text: z.string() }).loose(),
      })
      .loose(),
  ),
})

/** The last path segment, so a row fits a phone. */
function baseName(path: string): string {
  return path.split('/').findLast((segment) => segment !== '') ?? path
}

/** `run_terminal_command` → `Run terminal command`, for tools Grok gave no label. */
function humanize(name: string): string {
  const words = name.replaceAll(/[_-]+/g, ' ').trim()
  if (words === '') return name
  return words.charAt(0).toUpperCase() + words.slice(1)
}

function callLabel(call: ToolCall): string {
  const label = agentMeta(call)?.label
  if (label !== undefined) return label
  return humanize(call.name)
}

/**
 * The command of an execute call, wherever it survived.
 *
 * Grok's live `tool_call` often carries no `rawInput` — it only appears on
 * replay — so the completed call's `rawOutput` and the title are fallbacks.
 */
function executeInput(call: ToolCall): { command: string; description?: string } | undefined {
  const fromInput = executeInputSchema.safeParse(callInput(call))
  if (fromInput.success) return fromInput.data
  const fromOutput = z
    .object({ rawOutput: executeInputSchema })
    .safeParse(call.part.state === 'output-available' ? call.part.output : undefined)
  if (fromOutput.success) return fromOutput.data.rawOutput
  const fromTitle = /^Execute `([\s\S]+)`$/.exec(call.title)
  if (fromTitle?.[1] !== undefined) return { command: fromTitle[1] }
  return undefined
}

/** Terminal colour codes render as garbage in HTML; the words stay. */
function stripAnsi(text: string): string {
  // oxlint-disable-next-line no-control-regex -- the escape byte is the thing being removed.
  return text.replaceAll(/\[[0-9;?]*[ -/]*[@-~]/g, '')
}

function callOutput(call: ToolCall): ToolOutputView {
  const { part } = call
  if (part.state === 'output-error') {
    return { type: 'error', text: part.errorText }
  }
  if (part.state !== 'output-available') return { type: 'pending' }
  if (call.diffs.length > 0) return { type: 'diffs', diffs: call.diffs }
  const parsed = outputTextSchema.safeParse(part.output)
  if (parsed.success) {
    const text = stripAnsi(parsed.data.content.map((item) => item.content.text).join('\n'))
    if (text !== '') return { type: 'text', text }
  }
  const raw = z.object({ rawOutput: z.unknown() }).safeParse(part.output)
  if (raw.success && raw.data.rawOutput !== null && raw.data.rawOutput !== undefined) {
    return { type: 'json', value: raw.data.rawOutput }
  }
  return { type: 'empty' }
}

/**
 * Resolve one call for presentation.
 *
 * Falls back to Grok's own `title` when an input shape is not the known one,
 * so an unexpected tool still reads as a sentence, never as JSON.
 */
export function toolCallView(call: ToolCall): ToolCallView {
  const output = callOutput(call)
  const meta = agentMeta(call)
  const view = {
    label: callLabel(call),
    icon: call.kind satisfies ToolIcon,
    change: call.change,
    output,
  }
  const settled = output.type !== 'pending'

  // A directory listing hides behind kind `other`; Grok's own name says what it is.
  if (meta?.name === 'list_dir') {
    const input = listInputSchema.safeParse(callInput(call))
    const directory = input.success
      ? input.data.directory
      : /^List `([\s\S]+)`$/.exec(call.title)?.[1]
    if (directory !== undefined) {
      return {
        ...view,
        icon: 'list',
        verb: settled ? 'Listed' : 'Listing',
        subject: `${baseName(directory)}/`,
        code: true,
        field: { name: 'Directory', value: directory },
      }
    }
  }

  if (call.kind === 'execute') {
    const input = executeInput(call)
    if (input !== undefined) {
      const description = input.description
      return {
        ...view,
        verb: settled ? 'Ran' : 'Running',
        subject: description ?? input.command,
        code: description === undefined,
        field: { name: 'Command', value: input.command },
      }
    }
  }

  if (call.kind === 'search') {
    const input = searchInputSchema.safeParse(callInput(call))
    // Grok titles a search with its pattern, so the title is the fallback input —
    // unless it is a sentence like `Web search:`, which is no pattern at all.
    const pattern = input.success ? input.data.pattern : call.title.endsWith(':') ? '' : call.title
    if (pattern !== '') {
      return {
        ...view,
        verb: settled ? 'Searched' : 'Searching',
        subject: pattern,
        code: true,
        field: { name: 'Pattern', value: pattern },
      }
    }
  }

  if (call.kind === 'read') {
    // Locations arrive late on live calls: the input and the title also carry the path.
    const input = readInputSchema.safeParse(callInput(call))
    const path =
      call.path ??
      (input.success ? input.data.target_file : /^Read `([\s\S]+)`$/.exec(call.title)?.[1])
    if (path !== undefined) {
      return {
        ...view,
        verb: settled ? 'Read' : 'Reading',
        subject: baseName(path),
        code: true,
        field: { name: 'File', value: path },
      }
    }
  }

  if (
    (call.kind === 'edit' || call.kind === 'delete' || call.kind === 'move') &&
    call.path !== undefined
  ) {
    // A created file reads as written, not edited; Grok names the tool `write`.
    const verbs =
      call.kind === 'edit'
        ? meta?.name === 'write'
          ? (['Wrote', 'Writing'] as const)
          : (['Edited', 'Editing'] as const)
        : call.kind === 'delete'
          ? (['Deleted', 'Deleting'] as const)
          : (['Moved', 'Moving'] as const)
    return {
      ...view,
      verb: settled ? verbs[0] : verbs[1],
      subject: baseName(call.path),
      code: true,
      field: { name: 'File', value: call.path },
    }
  }

  if (call.kind === 'fetch') {
    const input = fetchInputSchema.safeParse(callInput(call))
    if (input.success) {
      return {
        ...view,
        verb: settled ? 'Fetched' : 'Fetching',
        subject: input.data.url,
        code: true,
        field: { name: 'URL', value: input.data.url },
      }
    }
  }

  // Anything else: Grok's title is the whole line — unless it is empty or a
  // dangling `Web search:`, where the tool's label reads better. The sheet
  // shows the input only when it actually carries something.
  const input = filledInputSchema.safeParse(callInput(call))
  const bareTitle = call.title.trim()
  const subject = bareTitle === '' || bareTitle.endsWith(':') ? view.label : call.title
  return {
    ...view,
    verb: '',
    subject,
    code: false,
    field: input.success
      ? { name: 'Input', value: JSON.stringify(input.data, null, 2) }
      : undefined,
  }
}

/** Sum of every edit in a run, for the folded line. Absent when nothing changed. */
export function runChanges(calls: readonly ToolCall[]): LineChange | undefined {
  const edits = calls.map((call) => call.change).filter((one) => one !== undefined)
  if (edits.length === 0) return undefined
  return edits.reduce((sum, one) => ({
    added: sum.added + one.added,
    removed: sum.removed + one.removed,
  }))
}

export { spanDiffCounts }
