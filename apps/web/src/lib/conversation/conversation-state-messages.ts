import {
  AttemptIdSchema,
  TurnIdSchema,
  createAttemptId,
  type AttemptId,
  type ConversationEvent,
  type ConversationItem,
  type ConversationState,
  type ConversationTurn,
  type MessageId,
  type ToolView,
  type TurnId,
} from '@porte/core/client'
import {
  ConversationEventProjector,
  canonicalContentToUIMessageParts,
  createConversationEventProjectionState,
} from '@web/lib/conversation/conversation-event-projector.ts'
import { readUIMessageStream, type UIMessage, type UIMessageChunk } from 'ai'
import { z } from 'zod'

/** How a turn ended, as the Host reports it in `turn.finished`. */
export type TurnOutcome = Extract<ConversationEvent, { type: 'turn.finished' }>['outcome']

/**
 * The rows one turn owns, under the ids the live stream also uses.
 *
 * The assistant row is `id = turnId`. The user row reuses the stored row whose
 * `metadata.turnId` matches (the browser's own id), else `${turnId}:user`.
 *
 * @param turn - One turn's items and tools from the Host.
 * @param existing - The rows AIChatAgent already holds.
 * @param userRowId - The sender's own row id, for the stream-alive path.
 * @param outcome - How the turn ended, when the caller has just seen it. The
 *   Host's view forgets it, so without it the stored assistant row's stamp stays.
 * @returns At most one user row and one assistant row.
 */
export async function turnToMessages(
  turn: ConversationTurn,
  existing: readonly UIMessage[],
  userRowId?: string,
  outcome?: TurnOutcome,
): Promise<UIMessage[]> {
  const messages: UIMessage[] = []
  const assistantItems: ConversationItem[] = []
  for (const item of turn.items) {
    if (item.type === 'message' && item.role === 'user') {
      // The turn link, the attempt stamp (survives a lost `turn.started`), then
      // the caller's hint for the stream-alive path.
      const stored =
        existing.find((row) => row.role === 'user' && turnIdOfRow(row) === turn.turnId) ??
        existing.find(
          (row) =>
            row.role === 'user' &&
            turn.attemptId !== undefined &&
            attemptIdOfRow(row) === turn.attemptId,
        ) ??
        existing.find((row) => row.role === 'user' && row.id === userRowId)
      const parts = item.content.flatMap((content) => canonicalContentToUIMessageParts(content))
      if (parts.length > 0) {
        messages.push({
          id: stored?.id ?? item.messageId,
          role: 'user',
          metadata: { turnId: turn.turnId },
          parts,
        })
      }
      continue
    }
    assistantItems.push(item)
  }
  const assistant = await assistantMessage(turn.turnId, assistantItems, turn.tools)
  if (assistant !== undefined && assistant.parts.length > 0) {
    const stored = existing.find((row) => row.id === turn.turnId)
    messages.push({ ...assistant, metadata: assistantRowMetadata(turn.turnId, stored, outcome) })
  }
  return messages
}

/** A stopped turn's mark on its assistant row. A finished turn carries none. */
const RowOutcomeSchema = z.object({ outcome: z.literal('cancelled') })

/**
 * How a stored assistant row's turn ended.
 *
 * @param row - One AIChatAgent row.
 * @returns `cancelled` for a turn the user stopped; undefined otherwise.
 */
export function outcomeOfRow(row: UIMessage): 'cancelled' | undefined {
  if (row.role !== 'assistant') return undefined
  return RowOutcomeSchema.safeParse(row.metadata).success ? 'cancelled' : undefined
}

/**
 * The turn link, plus the stop mark: from the outcome when the caller has one,
 * else whatever the stored row already carried, so a rebuild keeps it.
 */
function assistantRowMetadata(
  turnId: TurnId,
  stored: UIMessage | undefined,
  outcome: TurnOutcome | undefined,
): UIMessage['metadata'] {
  const cancelled =
    outcome === undefined
      ? stored !== undefined && outcomeOfRow(stored) === 'cancelled'
      : outcome.type === 'cancelled'
  return cancelled ? { turnId, outcome: 'cancelled' } : { turnId }
}

/** A stored row's link to its turn; the AI SDK types `metadata` as unknown. */
const RowTurnSchema = z.object({ turnId: TurnIdSchema })

/** A stored row's attempt stamp, set when the row was sent. */
const RowAttemptSchema = z.object({ attemptId: AttemptIdSchema })

/**
 * The attempt a stored row was sent under, when its metadata carries one.
 *
 * @param row - One AIChatAgent row.
 * @returns The attempt id, or undefined for a row without the stamp.
 */
export function attemptIdOfRow(row: UIMessage): AttemptId | undefined {
  const parsed = RowAttemptSchema.safeParse(row.metadata)
  return parsed.success ? parsed.data.attemptId : undefined
}

/**
 * The turn a stored row belongs to, when its metadata carries one.
 *
 * @param row - One AIChatAgent row.
 * @returns The turn id, or undefined for a row without the link.
 */
export function turnIdOfRow(row: UIMessage): TurnId | undefined {
  const parsed = RowTurnSchema.safeParse(row.metadata)
  return parsed.success ? parsed.data.turnId : undefined
}

/**
 * The relay's marker on a user row that waits for the running turn to end.
 * The store orders rows by creation, so the run order lives here.
 */
const RowQueuedSchema = z.object({ queued: z.literal(true), position: z.int().nonnegative() })

/**
 * The marker on the row the drain chose: out of the queue, about to start.
 * It keeps its position so a failed start can put it back.
 */
const RowDequeuedSchema = z.object({ dequeued: z.literal(true), position: z.int().nonnegative() })

/** The metadata a queued row carries until the drain picks it. */
export function queuedRowMetadata(position: number) {
  return { queued: true, position } satisfies z.infer<typeof RowQueuedSchema>
}

/** The metadata the drain gives the row it is about to start. */
export function dequeuedRowMetadata(position: number) {
  return { dequeued: true, position } satisfies z.infer<typeof RowDequeuedSchema>
}

/** True for a user row the relay holds back until the running turn ends. */
export function isQueuedRow(row: UIMessage): boolean {
  return queuedPositionOfRow(row) !== undefined
}

/** True for the row the drain took out of the queue and has not started yet. */
export function isDequeuedRow(row: UIMessage): boolean {
  return dequeuedPositionOfRow(row) !== undefined
}

/**
 * The run position of a queued row.
 *
 * @param row - One AIChatAgent row.
 * @returns The position, or undefined for a row that is not queued.
 */
export function queuedPositionOfRow(row: UIMessage): number | undefined {
  if (row.role !== 'user') return undefined
  const parsed = RowQueuedSchema.safeParse(row.metadata)
  return parsed.success ? parsed.data.position : undefined
}

/**
 * The position a dequeued row held, for putting it back on a failed start.
 *
 * @param row - One AIChatAgent row.
 * @returns The position, or undefined for a row that is not dequeued.
 */
export function dequeuedPositionOfRow(row: UIMessage): number | undefined {
  if (row.role !== 'user') return undefined
  const parsed = RowDequeuedSchema.safeParse(row.metadata)
  return parsed.success ? parsed.data.position : undefined
}

/**
 * The queued rows in run order.
 *
 * @param messages - The rows AIChatAgent holds.
 * @returns Queued user rows sorted by their position, lowest first.
 */
export function queuedRows(messages: readonly UIMessage[]): UIMessage[] {
  return messages
    .flatMap((row) => {
      if (row.role !== 'user') return []
      const parsed = RowQueuedSchema.safeParse(row.metadata)
      return parsed.success ? [{ row, position: parsed.data.position }] : []
    })
    .toSorted((left, right) => left.position - right.position)
    .map((entry) => entry.row)
}

/**
 * The user row `onChatMessage` starts: the first one with no turn link, no
 * attempt stamp, and not waiting in the queue. A browser send and the row the
 * drain dequeued both look like this.
 *
 * @param messages - The rows AIChatAgent holds, in transcript order.
 * @returns The row to start, or undefined when nothing can start.
 */
export function nextUserRow(messages: readonly UIMessage[]): UIMessage | undefined {
  return messages.find(
    (row) =>
      row.role === 'user' &&
      turnIdOfRow(row) === undefined &&
      attemptIdOfRow(row) === undefined &&
      !isQueuedRow(row),
  )
}

/**
 * Convert one complete Host state into the messages owned by AIChatAgent.
 *
 * @param state - The Host's `conversation.get` result.
 * @param existing - The rows AIChatAgent already holds, for user-row reuse.
 * @returns Every turn's rows, in transcript order.
 */
export async function conversationStateToMessages(
  state: ConversationState,
  existing: readonly UIMessage[],
): Promise<UIMessage[]> {
  const order: TurnId[] = []
  const byTurn = new Map<TurnId, ConversationItem[]>()
  for (const item of state.items) {
    const items = byTurn.get(item.turnId)
    if (items === undefined) {
      order.push(item.turnId)
      byTurn.set(item.turnId, [item])
    } else {
      items.push(item)
    }
  }
  const messages: UIMessage[] = []
  for (const turnId of order) {
    // The running turn's attempt travels with its slice, so user-row reuse works mid-turn.
    const attemptId =
      state.turn.state === 'running' && state.turn.turnId === turnId
        ? state.turn.attemptId
        : undefined
    const slice: ConversationTurn = {
      turnId,
      items: byTurn.get(turnId) ?? [],
      tools: state.tools,
    }
    // oxlint-disable-next-line no-await-in-loop -- Turn order defines transcript order.
    const rows = await turnToMessages(
      attemptId === undefined ? slice : { ...slice, attemptId },
      existing,
    )
    messages.push(...rows)
  }
  return messages
}

/** The running turn of a snapshot, shaped like the live events that would have opened it. */
export type RunningTurnReplay = {
  readonly turn: {
    readonly turnId: TurnId
    readonly attemptId: AttemptId
    readonly userMessageId: MessageId
    readonly parts: UIMessage['parts']
  }
  /** `turn.started`, then the reply so far: one delta per content part, nothing that closes. */
  readonly events: readonly ConversationEvent[]
}

/**
 * What a viewer who opens the conversation mid-turn missed: the running turn as
 * the events a live start would have sent, so the relay can open the same
 * stream it opens for a turn it watched from the first chunk. Nothing when no
 * turn runs, or when its user row has not reached the Host yet.
 */
export function runningTurnReplay(state: ConversationState): RunningTurnReplay | undefined {
  if (state.turn.state !== 'running') return undefined
  const { turnId } = state.turn
  // A Host that restarted mid-turn forgot the attempt; a foreign stream binds by turn id anyway.
  const attemptId = state.turn.attemptId ?? createAttemptId()
  const items = state.items.filter((item) => item.turnId === turnId)
  const user = items.find(
    (item): item is Extract<ConversationItem, { type: 'message' }> =>
      item.type === 'message' && item.role === 'user',
  )
  if (user === undefined) return undefined
  const events: ConversationEvent[] = [{ type: 'turn.started', turnId, attemptId }]
  for (const item of items) {
    if (item === user) continue
    if (item.type === 'message') {
      events.push({ type: 'message.started', turnId, messageId: item.messageId, role: item.role })
      for (const content of item.content) {
        events.push({ type: 'message.delta', turnId, messageId: item.messageId, content })
      }
    } else if (item.type === 'reasoning') {
      events.push({ type: 'reasoning.started', turnId, messageId: item.messageId })
      for (const content of item.content) {
        events.push({ type: 'reasoning.delta', turnId, messageId: item.messageId, content })
      }
    } else {
      const tool = state.tools.find((view) => view.toolCallId === item.toolCallId)
      if (tool !== undefined) events.push({ type: 'tool.updated', turnId, tool })
    }
  }
  return {
    turn: {
      turnId,
      attemptId,
      userMessageId: user.messageId,
      parts: user.content.flatMap((content) => canonicalContentToUIMessageParts(content)),
    },
    events,
  }
}

/** One assistant row per turn, `id = turnId`, exactly what the live stream builds. */
async function assistantMessage(
  turnId: TurnId,
  items: readonly ConversationItem[],
  tools: readonly ToolView[],
): Promise<UIMessage | undefined> {
  if (items.length === 0) return undefined
  const projector = new ConversationEventProjector()
  const projection = createConversationEventProjectionState()
  const chunks: UIMessageChunk[] = [{ type: 'start', messageId: turnId }, { type: 'start-step' }]

  for (const item of items) {
    if (item.type === 'message') {
      chunks.push(
        ...projector.project(
          { type: 'message.started', turnId, messageId: item.messageId, role: 'assistant' },
          projection,
        ),
      )
      for (const content of item.content) {
        chunks.push(
          ...projector.project(
            { type: 'message.delta', turnId, messageId: item.messageId, content },
            projection,
          ),
        )
      }
      chunks.push(
        ...projector.project(
          { type: 'message.completed', turnId, messageId: item.messageId },
          projection,
        ),
      )
      continue
    }
    if (item.type === 'reasoning') {
      chunks.push(
        ...projector.project(
          { type: 'reasoning.started', turnId, messageId: item.messageId },
          projection,
        ),
      )
      for (const content of item.content) {
        chunks.push(
          ...projector.project(
            { type: 'reasoning.delta', turnId, messageId: item.messageId, content },
            projection,
          ),
        )
      }
      chunks.push(
        ...projector.project(
          { type: 'reasoning.completed', turnId, messageId: item.messageId },
          projection,
        ),
      )
      continue
    }
    const tool = tools.find((entry) => entry.toolCallId === item.toolCallId)
    if (tool !== undefined)
      chunks.push(...projector.project({ type: 'tool.updated', turnId, tool }, projection))
  }
  chunks.push({ type: 'finish-step' }, { type: 'finish' })

  let message: UIMessage | undefined
  for await (const next of readUIMessageStream({ stream: chunkStream(chunks) })) message = next
  return message
}

function chunkStream(chunks: readonly UIMessageChunk[]): ReadableStream<UIMessageChunk> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk)
      controller.close()
    },
  })
}
