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
    const liveMapper = new AcpUpdateMapper(conversationId)
    const turnId = turnIdFor(conversationId, 0)
    liveMapper.beginTurn(turnId, 0)
    const liveEvents = [
      ...live.flatMap((notification) => liveMapper.map(notification)),
      ...liveMapper.endTurn(),
    ]

    const replayMapper = new AcpUpdateMapper(conversationId)
    const replayEvents = replay.flatMap((notification) => replayMapper.map(notification))
    const firstTurn = replayEvents.filter((event) => 'turnId' in event && event.turnId === turnId)

    // The aggregate raises the user message live; the replay maps it. Compare assistant-side ids.
    const assistantOnly = (ids: string[]) => ids.filter((id) => !id.endsWith(':user'))
    expect(assistantOnly(messageIds(liveEvents))).toEqual(assistantOnly(messageIds(firstTurn)))
    expect(messageIds(firstTurn)[0]).toBe(`${turnId} ${turnId}:user`)
  })
})
