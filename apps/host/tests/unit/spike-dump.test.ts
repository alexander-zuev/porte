import { readFileSync, writeFileSync } from 'node:fs'

import { Conversation } from '@host/domain/conversation/conversation.ts'
import { AcpUpdateMapper } from '@host/infrastructure/acp/acp-update-mapper.ts'
import type { AcpSessionNotification } from '@host/infrastructure/acp/message.ts'
import {
  ConversationIdSchema,
  IsoDateTimeSchema,
  MessageIdSchema,
  TurnIdSchema,
  type ConversationEvent,
} from '@porte/core/client'
import { it } from 'vitest'

const OUT =
  '/private/tmp/claude-501/-Users-az-projects-porte/a734cf62-77cf-4e92-b36e-052c002f75d4/scratchpad'

function fixture(name: string): AcpSessionNotification[] {
  const url = new URL(`../fixtures/acp/${name}.json`, import.meta.url)
  // SAFETY: fixtures are verbatim ACP payloads captured from grok 1.0.5.
  return JSON.parse(readFileSync(url, 'utf8')) as AcpSessionNotification[]
}

function raised(conversation: Conversation): ConversationEvent[] {
  const events = conversation
    .collectEvents()
    .flatMap((event) => (event.name === 'ConversationEventRaised' ? [event.event] : []))
  conversation.clearEvents()
  return events
}

it('dumps replay state and live events for the web spike', () => {
  // Replay: fixture → mapper → Conversation.replay → snapshot state
  const replay = fixture('porte-session-load')
  const replayId = ConversationIdSchema.parse(replay[0]!.sessionId)
  const mapper = new AcpUpdateMapper(replayId)
  const replayed = Conversation.restore({
    id: replayId,
    cwd: '/x',
    gitRoot: '/x/',
    title: '',
    updatedAt: IsoDateTimeSchema.parse('2026-08-27T00:00:00.000Z'),
  })
  const replayEvents = replay.flatMap((notification) => mapper.map(notification))
  replayed.replay(replayEvents)
  writeFileSync(`${OUT}/replay-state.json`, JSON.stringify(replayed.snapshot()))
  writeFileSync(`${OUT}/replay-events.json`, JSON.stringify(replayEvents))

  // Live: fixture → mapper.beginTurn → Conversation.beginTurn/applyAgentEvents/finishTurn
  const live = fixture('session-prompt-live')
  const liveId = ConversationIdSchema.parse(live[0]!.sessionId)
  const liveMapper = new AcpUpdateMapper(liveId)
  const conversation = Conversation.create({
    id: liveId,
    cwd: '/x',
    gitRoot: '/x/',
    now: new Date('2026-08-27T00:00:00.000Z'),
  })
  const turnId = TurnIdSchema.parse('0199-live-turn')
  const events: ConversationEvent[] = []
  conversation.beginTurn(turnId, {
    id: MessageIdSchema.parse('browser-user-1'),
    content: [
      { type: 'text', text: 'Read README.md in this repo and reply with its first line only.' },
    ],
  })
  events.push(...raised(conversation))
  liveMapper.beginTurn(turnId)
  for (const notification of live) {
    const mapped = liveMapper.map(notification)
    if (mapped.length === 0) continue
    conversation.applyAgentEvents(mapped)
    events.push(...raised(conversation))
  }
  conversation.applyAgentEvents(liveMapper.endTurn())
  events.push(...raised(conversation))
  conversation.finishTurn(turnId, { type: 'completed', reason: 'completed' })
  events.push(...raised(conversation))
  writeFileSync(`${OUT}/live-events.json`, JSON.stringify(events))
  writeFileSync(`${OUT}/live-state.json`, JSON.stringify(conversation.snapshot()))
})
