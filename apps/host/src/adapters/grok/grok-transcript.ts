import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  EventIdSchema,
  MessageIdSchema,
  ToolCallIdSchema,
  TurnIdSchema,
  type ConversationEvent,
  type ConversationId,
  type EventId,
  type FailureClassification,
  type MessageId,
  type ToolView,
  type TurnId,
} from '@porte/core/client'
import { Result, TaggedError, type Result as ResultType } from 'better-result'
import { z } from 'zod'

import { GrokConversationFilesError } from './grok-conversation-files.ts'

/**
 * Grok's stored transcript, as the fields the host reads.
 *
 * Unknown fields are ignored rather than rejected: this file is Grok's, and it
 * gains fields on its own schedule. A record we cannot read is skipped, because
 * one malformed line must not cost a person their whole history.
 */
const textPartSchema = z.object({ type: z.literal('text'), text: z.string() })

const toolCallSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  arguments: z.string().optional(),
})

const recordSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('system') }),
  z.object({ type: z.literal('user'), content: z.array(z.unknown()) }),
  z.object({
    type: z.literal('assistant'),
    content: z.string().optional(),
    tool_calls: z.array(toolCallSchema).optional(),
  }),
  z.object({
    type: z.literal('reasoning'),
    summary: z.array(z.unknown()).optional(),
  }),
  z.object({
    type: z.literal('tool_result'),
    tool_call_id: z.string().min(1),
    content: z.string().optional(),
  }),
])

const summaryTextSchema = z.object({ text: z.string() })

/** Grok injects the rules file into the first prompt. It is not what the person typed. */
const SYSTEM_REMINDER = /<system-reminder>[\s\S]*?<\/system-reminder>/g

/** One turn of a stored transcript, and how many lines of the file it took. */
export type StoredTurn = {
  readonly turnId: TurnId
  readonly events: readonly ConversationEvent[]
}

/** A transcript, in turns, plus the lines a reader could not understand. */
export type StoredTranscript = {
  readonly turns: readonly StoredTurn[]
  readonly skippedLines: number
}

/**
 * Read one stored conversation as canonical turns, newest last.
 *
 * No agent process is started. The file is Grok's own append-only record, so
 * this is the same history a session replay would produce, without the cost of
 * a session.
 *
 * Turns are not written to this file. A turn here is one user message and
 * everything the agent did before the next one, which is what a turn is.
 *
 * Every identifier is derived from the line that produced it, so two reads of
 * an unchanged file answer with the same events. A page can then be merged with
 * the page before it rather than duplicating it under new names.
 */
export async function readGrokTranscript(
  folderPath: string,
  conversationId: ConversationId,
): Promise<ResultType<StoredTranscript, GrokConversationFilesError>> {
  let raw: string
  try {
    raw = await readFile(join(folderPath, 'chat_history.jsonl'), 'utf8')
  } catch (cause) {
    return Result.err(new GrokConversationFilesError({ cause }))
  }

  return Result.ok(buildTranscript(raw, conversationId))
}

function buildTranscript(raw: string, conversationId: ConversationId): StoredTranscript {
  const turns: StoredTurn[] = []
  const tools = new Map<string, { turnId: TurnId; view: ToolView }>()
  let skippedLines = 0
  let current: { turnId: TurnId; events: ConversationEvent[] } | null = null

  const lines = raw.split('\n')
  for (const [index, line] of lines.entries()) {
    const record = parseRecord(line)
    if (record === null) {
      if (line.trim() !== '') skippedLines += 1
      continue
    }
    if (record.type === 'system') continue

    const at = idsFor(conversationId, index)

    if (record.type === 'user' || current === null) {
      if (current !== null) {
        current.events.push(finishTurn(conversationId, current.turnId, at('finish')))
        turns.push(current)
      }
      const turnId = storedTurnId(conversationId, index)
      current = { turnId, events: [startTurn(conversationId, turnId, at('start'))] }
    }

    if (record.type === 'user') {
      current.events.push(
        ...userEvents(conversationId, current.turnId, at, promptOf(record.content)),
      )
      continue
    }
    if (record.type === 'assistant') {
      current.events.push(...assistantEvents(conversationId, current.turnId, at, record, tools))
      continue
    }
    if (record.type === 'reasoning') {
      const text = textOf(record.summary ?? [])
      current.events.push(...reasoningEvents(conversationId, current.turnId, at, text))
      continue
    }
    current.events.push(...toolResultEvents(conversationId, at, record, tools))
  }

  if (current !== null) {
    const at = idsFor(conversationId, lines.length)
    current.events.push(finishTurn(conversationId, current.turnId, at('finish')))
    turns.push(current)
  }

  return { turns, skippedLines }
}

/** A caller asked for a page from somewhere a transcript has no position for. */
export class GrokTranscriptCursorError extends TaggedError('GrokTranscriptCursorError')<{
  cursor: string
  message: string
  classification: FailureClassification
}> {
  constructor(args: { cursor: string }) {
    super({ ...args, message: `unusable cursor: ${args.cursor}`, classification: 'terminal' })
  }
}

/** How many events one page may carry, whatever the caller asked for. */
const PAGE_LIMIT = { min: 1, max: 500 } as const

/**
 * One page, newest turn last, cut on turn boundaries.
 *
 * The cursor is the index of the oldest turn already delivered, counted from
 * the start. A later prompt appends, so every index already handed out still
 * points at the same turn: counting from the end would not.
 *
 * A page never splits a turn. Half a turn renders as an answer with no question
 * and a tool with no call, so a turn larger than the limit is sent whole.
 */
export function pageOfTurns(
  turns: readonly StoredTurn[],
  cursor: string | null,
  limit: number,
): ResultType<{ events: ConversationEvent[]; next: string | null }, GrokTranscriptCursorError> {
  if (cursor !== null && !/^\d+$/.test(cursor)) {
    return Result.err(new GrokTranscriptCursorError({ cursor }))
  }

  const end = cursor === null ? turns.length : Math.min(Number(cursor), turns.length)
  const room = Math.min(Math.max(limit, PAGE_LIMIT.min), PAGE_LIMIT.max)

  let start = end
  let carried = 0
  while (start > 0) {
    const size = turns[start - 1]?.events.length ?? 0
    if (carried > 0 && carried + size > room) break

    carried += size
    start -= 1
  }

  const events: ConversationEvent[] = []
  for (const turn of turns.slice(start, end)) events.push(...turn.events)

  return Result.ok({ events, next: start === 0 ? null : String(start) })
}

/**
 * Identifiers for one line, derived from where in the file it came from.
 *
 * The conversation and the line already name the thing uniquely, so nothing
 * here has to be minted, and nothing changes between two reads.
 */
type At = ((part: string) => EventId) & { readonly message: (part: string) => MessageId }

function idsFor(conversationId: ConversationId, line: number): At {
  const name = (part: string) => `${conversationId}:${String(line)}:${part}`
  const at = (part: string) => EventIdSchema.parse(name(part))

  return Object.assign(at, { message: (part: string) => MessageIdSchema.parse(name(part)) })
}

/**
 * A turn identifier that is stable across reads.
 *
 * `TurnId` is a v7 uuid on the wire, so a derived one is built to that shape
 * rather than minted: the conversation fills the random half, and the line
 * fills the low bits, which is what makes it unique within the file.
 */
function storedTurnId(conversationId: ConversationId, line: number): TurnId {
  const seed = hex(hash(conversationId), 12)
  const at = hex(line, 12)

  return TurnIdSchema.parse(
    `${seed.slice(0, 8)}-${seed.slice(8, 12)}-7${at.slice(0, 3)}-8${seed.slice(0, 3)}-${at}`,
  )
}

/** FNV-1a, for spreading one conversation identifier across a uuid's random half. */
function hash(value: string): number {
  let result = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index)
    result = Math.imul(result, 0x01000193) >>> 0
  }
  return result
}

function hex(value: number, width: number): string {
  return value.toString(16).padStart(width, '0').slice(-width)
}

function parseRecord(line: string): z.infer<typeof recordSchema> | null {
  if (line.trim() === '') return null

  let json: unknown
  try {
    json = JSON.parse(line)
  } catch {
    return null
  }

  const parsed = recordSchema.safeParse(json)
  return parsed.success ? parsed.data : null
}

/** Grok writes text as parts here and as a plain string elsewhere. */
function textOf(parts: readonly unknown[]): string {
  return parts
    .map((part) => {
      const text = textPartSchema.safeParse(part)
      if (text.success) return text.data.text
      const summary = summaryTextSchema.safeParse(part)
      return summary.success ? summary.data.text : ''
    })
    .filter((text) => text !== '')
    .join('\n')
}

/** What the person typed, without the rules file Grok staples to the first one. */
function promptOf(parts: readonly unknown[]): string {
  return textOf(parts).replaceAll(SYSTEM_REMINDER, '').trim()
}

function startTurn(
  conversationId: ConversationId,
  turnId: TurnId,
  eventId: EventId,
): ConversationEvent {
  return { eventId, conversationId, type: 'turn.started', turnId }
}

function finishTurn(
  conversationId: ConversationId,
  turnId: TurnId,
  eventId: EventId,
): ConversationEvent {
  return {
    eventId,
    conversationId,
    type: 'turn.finished',
    turnId,
    outcome: { type: 'completed', reason: 'completed' },
  }
}

function userEvents(
  conversationId: ConversationId,
  turnId: TurnId,
  at: At,
  text: string,
): ConversationEvent[] {
  if (text === '') return []

  const messageId = at.message('user')
  return [
    {
      eventId: at('user-start'),
      conversationId,
      type: 'message.started',
      turnId,
      messageId,
      role: 'user',
    },
    {
      eventId: at('user-delta'),
      conversationId,
      type: 'message.delta',
      turnId,
      messageId,
      content: { type: 'text', text },
    },
    { eventId: at('user-end'), conversationId, type: 'message.completed', turnId, messageId },
  ]
}

function assistantEvents(
  conversationId: ConversationId,
  turnId: TurnId,
  at: At,
  record: { content?: string; tool_calls?: readonly z.infer<typeof toolCallSchema>[] },
  tools: Map<string, { turnId: TurnId; view: ToolView }>,
): ConversationEvent[] {
  const events: ConversationEvent[] = []

  if (record.content !== undefined && record.content !== '') {
    const messageId = at.message('assistant')
    events.push(
      {
        eventId: at('assistant-start'),
        conversationId,
        type: 'message.started',
        turnId,
        messageId,
        role: 'assistant',
      },
      {
        eventId: at('assistant-delta'),
        conversationId,
        type: 'message.delta',
        turnId,
        messageId,
        content: { type: 'text', text: record.content },
      },
      {
        eventId: at('assistant-end'),
        conversationId,
        type: 'message.completed',
        turnId,
        messageId,
      },
    )
  }

  for (const [index, call] of (record.tool_calls ?? []).entries()) {
    const view: ToolView = {
      toolCallId: ToolCallIdSchema.parse(call.id),
      title: call.name,
      kind: 'other',
      status: 'in_progress',
      content: [],
      locations: [],
    }
    // Held with its turn, so a result written after the next prompt still
    // belongs to the turn that made the call.
    tools.set(call.id, { turnId, view })
    events.push({
      eventId: at(`tool-${String(index)}`),
      conversationId,
      type: 'tool.updated',
      turnId,
      tool: view,
    })
  }

  return events
}

function reasoningEvents(
  conversationId: ConversationId,
  turnId: TurnId,
  at: At,
  text: string,
): ConversationEvent[] {
  if (text === '') return []

  const messageId = at.message('reasoning')
  return [
    {
      eventId: at('reasoning-start'),
      conversationId,
      type: 'reasoning.started',
      turnId,
      messageId,
    },
    {
      eventId: at('reasoning-delta'),
      conversationId,
      type: 'reasoning.delta',
      turnId,
      messageId,
      content: { type: 'text', text },
    },
    {
      eventId: at('reasoning-end'),
      conversationId,
      type: 'reasoning.completed',
      turnId,
      messageId,
    },
  ]
}

/** A result completes the call it names, which the assistant record announced. */
function toolResultEvents(
  conversationId: ConversationId,
  at: At,
  record: { tool_call_id: string; content?: string },
  tools: Map<string, { turnId: TurnId; view: ToolView }>,
): ConversationEvent[] {
  const started = tools.get(record.tool_call_id)
  if (started === undefined) return []

  const view: ToolView = {
    ...started.view,
    status: 'completed',
    content:
      record.content === undefined
        ? []
        : [{ type: 'content', content: { type: 'text', text: record.content } }],
  }
  tools.set(record.tool_call_id, { turnId: started.turnId, view })

  return [
    {
      eventId: at('tool-result'),
      conversationId,
      type: 'tool.updated',
      turnId: started.turnId,
      tool: view,
    },
  ]
}
