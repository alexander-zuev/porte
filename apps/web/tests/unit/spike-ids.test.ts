import { readFileSync } from 'node:fs'

import type { ConversationEvent, ConversationState } from '@porte/core/client'
import {
  ConversationEventProjector,
  createConversationEventProjectionState,
} from '@web/lib/conversation/conversation-event-projector.ts'
import { conversationStateToMessages } from '@web/lib/conversation/conversation-state-messages.ts'
import { readUIMessageStream, type UIMessage, type UIMessageChunk } from 'ai'
import { it } from 'vitest'

const OUT =
  '/private/tmp/claude-501/-Users-az-projects-porte/a734cf62-77cf-4e92-b36e-052c002f75d4/scratchpad'

function load<T>(name: string): T {
  return JSON.parse(readFileSync(`${OUT}/${name}.json`, 'utf8')) as T
}

function chunkStream(chunks: readonly UIMessageChunk[]): ReadableStream<UIMessageChunk> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk)
      controller.close()
    },
  })
}

/** Project one turn's events the way ConversationAgent does live. */
async function liveMessages(
  events: readonly ConversationEvent[],
  stored: readonly UIMessage[],
): Promise<UIMessage[]> {
  const projector = new ConversationEventProjector()
  const messages: UIMessage[] = []
  let chunks: UIMessageChunk[] = []
  let projection = createConversationEventProjectionState(stored)
  const flush = async () => {
    if (chunks.length === 0) return
    let message: UIMessage | undefined
    for await (const next of readUIMessageStream({ stream: chunkStream(chunks) })) message = next
    if (message !== undefined) messages.push(message)
    chunks = []
  }
  for (const event of events) {
    if (event.type === 'turn.started') {
      await flush()
      projection = createConversationEventProjectionState(stored)
    }
    chunks.push(...projector.project(event, projection))
  }
  await flush()
  return messages
}

function summary(messages: readonly UIMessage[]): string[] {
  return messages.map((m) => `${m.role} ${m.id} [${m.parts.map((p) => p.type).join(',')}]`)
}

it('compares live projection with snapshot conversion', async () => {
  const liveEvents = load<ConversationEvent[]>('live-events')
  const liveState = load<ConversationState>('live-state')
  const stored: UIMessage[] = [{ id: 'browser-user-1', role: 'user', parts: [] }]

  const live = await liveMessages(liveEvents, stored)
  const snapshot = await conversationStateToMessages(liveState)
  console.log(
    'LIVE (assistant only, user row is stored by AIChatAgent):\n' + summary(live).join('\n'),
  )
  console.log('SNAPSHOT:\n' + summary(snapshot).join('\n'))

  const replayState = load<ConversationState>('replay-state')
  const replayEvents = load<ConversationEvent[]>('replay-events')
  const replaySnapshot = await conversationStateToMessages(replayState)
  console.log('REPLAY SNAPSHOT:\n' + summary(replaySnapshot).join('\n'))
  const replayLive = await liveMessages(replayEvents, [])
  console.log('REPLAY EVENTS THROUGH LIVE PROJECTOR:\n' + summary(replayLive).join('\n'))
  console.log('replay item turn ids sample:', JSON.stringify(replayState.items.slice(0, 4)))
})
