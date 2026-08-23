import {
  TranscriptCursorSchema,
  TurnIdSchema,
  type ConversationEvent,
  type ConversationView,
  type FailureClassification,
  type TranscriptCursor,
  type TurnId,
} from '@porte/core/client'
import { Result, TaggedError, type Result as ResultType } from 'better-result'

/** One canonical conversation turn built from an ACP session replay. */
export type StoredTurn = {
  readonly turnId: TurnId
  readonly events: readonly ConversationEvent[]
}

/** Build canonical turns from the complete view produced by ACP session/load. */
export function conversationViewToStoredTurns(view: ConversationView): StoredTurn[] {
  const tools = new Map(view.tools.map((tool) => [tool.toolCallId, tool]))
  const turns: { turnId: TurnId; events: ConversationEvent[] }[] = []
  let current: { turnId: TurnId; events: ConversationEvent[] } | undefined

  for (const item of view.items) {
    if (item.type === 'message' && item.role === 'user') {
      if (current !== undefined) finish(current)
      current = { turnId: TurnIdSchema.parse(item.messageId), events: [] }
      current.events.push({ type: 'turn.started', turnId: current.turnId })
      turns.push(current)
    }

    if (current === undefined) {
      const id = item.type === 'tool' ? item.toolCallId : item.messageId
      current = { turnId: TurnIdSchema.parse(id), events: [] }
      current.events.push({ type: 'turn.started', turnId: current.turnId })
      turns.push(current)
    }

    if (item.type === 'message') {
      current.events.push({
        type: 'message.started',
        turnId: current.turnId,
        messageId: item.messageId,
        role: item.role,
      })
      for (const content of item.content) {
        current.events.push({
          type: 'message.delta',
          turnId: current.turnId,
          messageId: item.messageId,
          content,
        })
      }
      current.events.push({
        type: 'message.completed',
        turnId: current.turnId,
        messageId: item.messageId,
      })
      continue
    }

    if (item.type === 'reasoning') {
      current.events.push({
        type: 'reasoning.started',
        turnId: current.turnId,
        messageId: item.messageId,
      })
      for (const content of item.content) {
        current.events.push({
          type: 'reasoning.delta',
          turnId: current.turnId,
          messageId: item.messageId,
          content,
        })
      }
      current.events.push({
        type: 'reasoning.completed',
        turnId: current.turnId,
        messageId: item.messageId,
      })
      continue
    }

    const tool = tools.get(item.toolCallId)
    if (tool !== undefined) {
      current.events.push({ type: 'tool.updated', turnId: current.turnId, tool })
    }
  }

  if (current !== undefined) finish(current)
  return turns
}

function finish(turn: { turnId: TurnId; events: ConversationEvent[] }): void {
  turn.events.push({
    type: 'turn.finished',
    turnId: turn.turnId,
    outcome: { type: 'completed', reason: 'completed' },
  })
}

/** A caller supplied a cursor that cannot address the transcript. */
export class GrokTranscriptCursorError extends TaggedError('GrokTranscriptCursorError')<{
  cursor: string
  message: string
  classification: FailureClassification
}> {
  constructor(args: { cursor: string }) {
    super({ ...args, message: `unusable cursor: ${args.cursor}`, classification: 'terminal' })
  }
}

const PAGE_LIMIT = { min: 1, max: 500 } as const

/** Return one newest-first page without splitting a conversation turn. */
export function pageOfTurns(
  turns: readonly StoredTurn[],
  cursor: string | null,
  limit: number,
): ResultType<
  { events: ConversationEvent[]; next: TranscriptCursor | null },
  GrokTranscriptCursorError
> {
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

  const events = turns.slice(start, end).flatMap((turn) => turn.events)
  return Result.ok({
    events,
    next: start === 0 ? null : TranscriptCursorSchema.parse(String(start)),
  })
}
