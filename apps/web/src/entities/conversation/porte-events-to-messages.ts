import type { CanonicalContent, ConversationEvent, MessageId, TurnId } from '@porte/core/client'
import {
  ConversationEventProjector,
  canonicalContentToUIMessageParts,
  createConversationEventProjectionState,
} from '@web/lib/conversation/conversation-event-projector.ts'
import { readUIMessageStream, type UIMessage, type UIMessageChunk } from 'ai'

type TurnEvents = {
  readonly turnId: TurnId
  readonly events: ConversationEvent[]
}

/** Builds stored messages through the same event projector as the live stream. */
export async function porteEventsToMessages(
  events: readonly ConversationEvent[],
): Promise<UIMessage[]> {
  const messages = await Promise.all(
    groupTurnEvents(events).map(async (turn) => {
      const turnMessages = userMessages(turn.events)
      const assistant = await assistantMessage(turn)
      if (assistant !== undefined && assistant.parts.length > 0) turnMessages.push(assistant)
      return turnMessages
    }),
  )
  return messages.flat()
}

function groupTurnEvents(events: readonly ConversationEvent[]): TurnEvents[] {
  const turns: TurnEvents[] = []
  const byId = new Map<TurnId, TurnEvents>()
  let current: TurnEvents | undefined

  for (const event of events) {
    const turnId = 'turnId' in event ? event.turnId : undefined
    if (turnId !== undefined) {
      current = byId.get(turnId)
      if (current === undefined) {
        current = { turnId, events: [] }
        byId.set(turnId, current)
        turns.push(current)
      }
    }
    if (current !== undefined) current.events.push(event)
  }
  return turns
}

function userMessages(events: readonly ConversationEvent[]): UIMessage[] {
  const messages: UIMessage[] = []
  const byId = new Map<MessageId, UIMessage>()
  const roles = new Map<MessageId, 'user' | 'assistant'>()

  for (const event of events) {
    if (event.type === 'message.started') {
      roles.set(event.messageId, event.role)
      if (event.role === 'user') {
        const message = {
          id: event.messageId,
          role: 'user',
          parts: [],
        } satisfies UIMessage
        byId.set(event.messageId, message)
        messages.push(message)
      }
      continue
    }
    if (
      event.type !== 'message.delta' ||
      roles.get(event.messageId) !== 'user' ||
      !byId.has(event.messageId)
    ) {
      continue
    }
    appendCanonicalContent(byId.get(event.messageId)!, event.content)
  }
  return messages.filter((message) => message.parts.length > 0)
}

function appendCanonicalContent(message: UIMessage, content: CanonicalContent): void {
  const last = message.parts.at(-1)
  if (content.type === 'text') {
    if (last?.type === 'text') last.text += content.text
    else message.parts.push({ type: 'text', text: content.text, state: 'done' })
    return
  }
  message.parts.push(...canonicalContentToUIMessageParts(content))
}

async function assistantMessage(turn: TurnEvents): Promise<UIMessage | undefined> {
  const projector = new ConversationEventProjector()
  const state = createConversationEventProjectionState()
  const chunks = turn.events.flatMap((event) => projector.project(event, state))
  if (!chunks.some((chunk) => chunk.type === 'start')) {
    chunks.unshift({ type: 'start', messageId: turn.turnId })
  }

  let message: UIMessage | undefined
  for await (const next of readUIMessageStream({ stream: chunkStream(chunks) })) {
    message = next
  }
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
