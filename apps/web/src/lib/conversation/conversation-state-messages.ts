import {
  AttemptIdSchema,
  TurnIdSchema,
  type AttemptId,
  type ConversationItem,
  type ConversationState,
  type ConversationTurn,
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

/**
 * The rows one turn owns, under the ids the live stream also uses.
 *
 * The assistant row is `id = turnId`. The user row reuses the stored row whose
 * `metadata.turnId` matches (the browser's own id), else `${turnId}:user`.
 *
 * @param turn - One turn's items and tools from the Host.
 * @param existing - The rows AIChatAgent already holds.
 * @returns At most one user row and one assistant row.
 */
export async function turnToMessages(
  turn: ConversationTurn,
  existing: readonly UIMessage[],
  userRowId?: string,
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
  if (assistant !== undefined && assistant.parts.length > 0) messages.push(assistant)
  return messages
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
  return message === undefined ? undefined : { ...message, metadata: { turnId } }
}

function chunkStream(chunks: readonly UIMessageChunk[]): ReadableStream<UIMessageChunk> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk)
      controller.close()
    },
  })
}
