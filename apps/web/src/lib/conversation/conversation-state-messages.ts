import {
  notYetImplemented,
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
): Promise<UIMessage[]> {
  // TODO(step 3): group by turn, project assistant items under `id = turnId`, reuse the user row by `metadata.turnId`.
  void turn
  void existing
  return notYetImplemented('step 3')
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
  // TODO(step 3): split `state.items` by `turnId` and concatenate `turnToMessages` per turn.
  void existing
  return legacyStateToMessages(state)
}

/** The pre-redesign conversion; it mints its own turn id and dies in step 3. */
async function legacyStateToMessages(state: ConversationState): Promise<UIMessage[]> {
  const messages: UIMessage[] = []
  let assistantItems: ConversationItem[] = []

  const flushAssistant = async (): Promise<void> => {
    if (assistantItems.length === 0) return
    const message = await assistantMessage(assistantItems, state.tools)
    if (message !== undefined && message.parts.length > 0) messages.push(message)
    assistantItems = []
  }

  for (const item of state.items) {
    if (item.type === 'message' && item.role === 'user') {
      // oxlint-disable-next-line no-await-in-loop -- Message order defines conversation order.
      await flushAssistant()
      const parts = item.content.flatMap((content) => canonicalContentToUIMessageParts(content))
      if (parts.length > 0) messages.push({ id: item.messageId, role: 'user', parts })
      continue
    }
    assistantItems.push(item)
  }
  await flushAssistant()
  return messages
}

async function assistantMessage(
  items: readonly ConversationItem[],
  tools: readonly ToolView[],
): Promise<UIMessage | undefined> {
  const messageId = itemId(items[0])
  if (messageId === undefined) return undefined
  const first = items[0]
  const turnId: TurnId | undefined = first?.turnId
  if (turnId === undefined) return undefined
  const projector = new ConversationEventProjector()
  const projection = createConversationEventProjectionState()
  const chunks: UIMessageChunk[] = [{ type: 'start', messageId }, { type: 'start-step' }]

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

function itemId(item: ConversationItem | undefined): string | undefined {
  if (item === undefined) return undefined
  return item.type === 'tool' ? item.toolCallId : item.messageId
}

function chunkStream(chunks: readonly UIMessageChunk[]): ReadableStream<UIMessageChunk> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk)
      controller.close()
    },
  })
}
