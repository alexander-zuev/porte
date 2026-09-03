import { readFileSync } from 'node:fs'

import { AcpUpdateMapper } from '@host/infrastructure/acp/acp-update-mapper.ts'
import type { AcpSessionNotification } from '@host/infrastructure/acp/message.ts'
import { ConversationIdSchema, turnIdFor, type ConversationEvent } from '@porte/core/client'
import { describe, expect, it } from 'vitest'

/**
 * `session-prompt-live.json` and `session-load-replay.json` are the same Grok
 * session: one seen live, one replayed by `session/load`. Every id the mapper
 * mints must agree between the two, or the relay store flips after a Host restart.
 */
function fixture(name: string): AcpSessionNotification[] {
  const url = new URL(`../fixtures/acp/${name}.json`, import.meta.url)
  // SAFETY: fixtures are verbatim `session/update` notifications captured from grok 1.0.5.
  return JSON.parse(readFileSync(url, 'utf8')) as AcpSessionNotification[]
}

const live = fixture('session-prompt-live')
const replay = fixture('session-load-replay')
const conversationId = ConversationIdSchema.parse(live[0]!.sessionId)

function messageIds(events: readonly ConversationEvent[]): string[] {
  return events.flatMap((event) =>
    event.type === 'message.started' || event.type === 'reasoning.started'
      ? [`${event.turnId} ${event.messageId}`]
      : [],
  )
}

describe('identity across live and replay', () => {
  it('mints the same turn and message ids for the first turn seen live and replayed', () => {
    const turnId = turnIdFor(conversationId, 0)
    // The live capture starts after the user echo; the replay carries it. Open the turn the same way.
    const echo = replay.find((n) => n.update.sessionUpdate === 'user_message_chunk')
    if (echo === undefined) throw new TypeError('replay fixture has no user chunk')
    const liveMapper = new AcpUpdateMapper(conversationId)
    const liveEvents = [
      ...liveMapper.map(echo),
      ...live.flatMap((notification) => liveMapper.map(notification)),
      ...liveMapper.completeTurn({ sessionUpdate: 'turn_completed', stop_reason: 'end_turn' }),
    ]

    const replayMapper = new AcpUpdateMapper(conversationId)
    const replayEvents = replay.flatMap((notification) => replayMapper.map(notification))
    const firstTurn = replayEvents.filter((event) => 'turnId' in event && event.turnId === turnId)

    expect(messageIds(liveEvents)).toEqual(messageIds(firstTurn))
    expect(messageIds(firstTurn)[0]).toBe(`${turnId} ${turnId}:user`)
  })
})
