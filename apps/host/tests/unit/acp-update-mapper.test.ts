import { readFileSync } from 'node:fs'

import { Conversation } from '@host/domain/conversation/conversation.ts'
import {
  AcpSessionMismatchError,
  AcpUpdateMapper,
  AcpUpdateSequenceError,
} from '@host/infrastructure/acp/acp-update-mapper.ts'
import type { AcpSessionNotification } from '@host/infrastructure/acp/message.ts'
import {
  ConversationIdSchema,
  IsoDateTimeSchema,
  TurnIdSchema,
  type ConversationEvent,
} from '@porte/core/client'
import { describe, expect, it } from 'vitest'

function fixture(name: string): AcpSessionNotification[] {
  const url = new URL(`../fixtures/acp/${name}.json`, import.meta.url)
  // SAFETY: fixtures are verbatim `session/update` notifications captured from grok 1.0.5.
  return JSON.parse(readFileSync(url, 'utf8')) as AcpSessionNotification[]
}

const replay = fixture('session-load-replay')
const live = fixture('session-prompt-live')
const conversationId = ConversationIdSchema.parse(replay[0]!.sessionId)
const turnId = TurnIdSchema.parse('turn-live')

function types(events: readonly ConversationEvent[]): string[] {
  return events.map((event) => event.type)
}

describe('AcpUpdateMapper', () => {
  it('replays a 2-turn load with deterministic ids and one tool.updated per call', () => {
    const mapper = new AcpUpdateMapper(conversationId, () => undefined)
    const events = replay.flatMap((notification) => mapper.map(notification))
    const turnIds = new Set(events.flatMap((event) => ('turnId' in event ? [event.turnId] : [])))
    expect([...turnIds]).toEqual([`${conversationId}:turn:0`, `${conversationId}:turn:1`])
    expect(types(events).filter((type) => type === 'tool.updated')).toHaveLength(2)
    expect(events[1]).toMatchObject({
      type: 'message.delta',
      messageId: `${conversationId}:turn:0:user`,
    })
  })

  it('replay folds into a restored conversation without raising', () => {
    const mapper = new AcpUpdateMapper(conversationId, () => undefined)
    const conversation = Conversation.restore({
      id: conversationId,
      cwd: '/repo',
      gitRoot: '/repo',
      title: '',
      updatedAt: IsoDateTimeSchema.parse('2026-08-27T12:00:00.000Z'),
    })
    conversation.replay(replay.flatMap((notification) => mapper.map(notification)))
    const state = conversation.snapshot()
    expect(state.items.map((item) => item.type).join(' ')).toBe(
      'message reasoning message tool reasoning message tool reasoning message message reasoning',
    )
    expect(state.commands).toHaveLength(3)
    expect(conversation.collectEvents()).toEqual([])
  })

  it('maps a live turn: user chunk skipped, commands once, streams closed at the end', () => {
    const mapper = new AcpUpdateMapper(conversationId, () => undefined)
    mapper.beginTurn(turnId, 0)
    const events = live.flatMap((notification) => mapper.map(notification))
    const counts = Map.groupBy(types(events), (type) => type)
    expect(events.some((event) => 'role' in event && event.role === 'user')).toBe(false)
    expect(counts.get('conversation.commands.updated')).toHaveLength(1)
    expect(counts.get('tool.updated')).toHaveLength(8)
    expect(events[0]).toMatchObject({ type: 'conversation.metadata.updated' })
    expect(types(mapper.endTurn())).toEqual(['reasoning.completed', 'message.completed'])
  })

  it('rejects updates outside a turn, a second live turn, and another session', () => {
    const mapper = new AcpUpdateMapper(conversationId, () => undefined)
    expect(() => mapper.map(live[2]!)).toThrow(AcpUpdateSequenceError)
    mapper.beginTurn(turnId, 0)
    expect(() => {
      mapper.beginTurn(turnId, 0)
    }).toThrow(AcpUpdateSequenceError)
    expect(() => mapper.map({ ...live[2]!, sessionId: 'other' })).toThrow(AcpSessionMismatchError)
  })
})
