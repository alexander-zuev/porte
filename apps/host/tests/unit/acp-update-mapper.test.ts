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
    const mapper = new AcpUpdateMapper(conversationId)
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
    const mapper = new AcpUpdateMapper(conversationId)
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
    const mapper = new AcpUpdateMapper(conversationId)
    mapper.beginTurn(turnId, 0)
    const events = live.flatMap((notification) => mapper.map(notification))
    const counts = Map.groupBy(types(events), (type) => type)
    expect(events.some((event) => 'role' in event && event.role === 'user')).toBe(false)
    expect(counts.get('conversation.commands.updated')).toHaveLength(1)
    expect(counts.get('tool.updated')).toHaveLength(8)
    expect(events[0]).toMatchObject({ type: 'conversation.metadata.updated' })
    expect(types(mapper.endTurn())).toEqual(['reasoning.completed', 'message.completed'])
  })

  it('keeps the input and the diff when a later update carries null or nothing', () => {
    const mapper = new AcpUpdateMapper(conversationId)
    mapper.beginTurn(turnId, 0)
    const diff = { type: 'diff', path: '/repo/README.md', oldText: 'a', newText: 'b' } as const
    mapper.map({
      sessionId: conversationId,
      update: {
        sessionUpdate: 'tool_call',
        toolCallId: 'call-1',
        title: 'Write README.md',
        kind: 'edit',
        status: 'pending',
        rawInput: { path: '/repo/README.md' },
        content: [diff],
      },
    })
    const [event] = mapper.map({
      sessionId: conversationId,
      update: {
        sessionUpdate: 'tool_call_update',
        toolCallId: 'call-1',
        status: 'completed',
        rawInput: null,
        content: [],
      },
    })
    expect(event).toMatchObject({
      type: 'tool.updated',
      tool: { status: 'completed', rawInput: { path: '/repo/README.md' }, content: [diff] },
    })
  })

  it('keeps a hidden reminder chunk out of the transcript but in the turn count', () => {
    // Captured from grok 1.0.5: a subagent completion injected as a hidden user chunk.
    const mapper = new AcpUpdateMapper(conversationId)
    const events = [
      mapper.map({
        sessionId: conversationId,
        update: {
          sessionUpdate: 'user_message_chunk',
          content: {
            type: 'text',
            text: '<system-reminder>\nBackground subagent "01a05a3e" (explore: "Read tool-detail only") completed successfully.\nDuration: 7.3s | Tool calls: 1 | Turns: 1\n</system-reminder>',
          },
          _meta: { modelId: 'grok-4.6', promptIndex: 6, hideFromScrollback: true },
        },
      }),
      mapper.map({
        sessionId: conversationId,
        update: {
          sessionUpdate: 'agent_message_chunk',
          content: { type: 'text', text: 'The subagent is done.' },
        },
      }),
    ].flat()
    expect(events.some((event) => 'role' in event && event.role === 'user')).toBe(false)
    // The reminder still owns prompt slot 6, so the turn id cannot flip on replay.
    expect(events.at(-1)).toMatchObject({
      type: 'message.delta',
      turnId: `${conversationId}:turn:6`,
    })
  })

  it('mints a fresh turn for a repeated promptIndex so the replay folds without raising', () => {
    // Captured from grok 1.0.13: the TUI and the Host each numbered a prompt 3.
    const mapper = new AcpUpdateMapper(conversationId)
    const prompt = (promptIndex: number, text: string): AcpSessionNotification => ({
      sessionId: conversationId,
      update: {
        sessionUpdate: 'user_message_chunk',
        content: { type: 'text', text },
        _meta: { modelId: 'grok-4.6', promptIndex },
      },
    })
    const reply: AcpSessionNotification = {
      sessionId: conversationId,
      update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'ok' } },
    }
    const events = [
      prompt(3, 'commit'),
      reply,
      prompt(4, 'long'),
      reply,
      prompt(3, 'more'),
      reply,
    ].flatMap((notification) => mapper.map(notification))
    const turnIds = new Set(events.flatMap((event) => ('turnId' in event ? [event.turnId] : [])))
    expect([...turnIds]).toEqual([
      `${conversationId}:turn:3`,
      `${conversationId}:turn:4`,
      `${conversationId}:turn:5`,
    ])
    const conversation = Conversation.restore({
      id: conversationId,
      cwd: '/repo',
      gitRoot: '/repo',
      title: '',
      updatedAt: IsoDateTimeSchema.parse('2026-09-03T12:00:00.000Z'),
    })
    expect(() => {
      conversation.replay(events)
    }).not.toThrow()
  })

  it('rejects updates outside a turn, a second live turn, and another session', () => {
    const mapper = new AcpUpdateMapper(conversationId)
    expect(() => mapper.map(live[2]!)).toThrow(AcpUpdateSequenceError)
    mapper.beginTurn(turnId, 0)
    expect(() => {
      mapper.beginTurn(turnId, 0)
    }).toThrow(AcpUpdateSequenceError)
    expect(() => mapper.map({ ...live[2]!, sessionId: 'other' })).toThrow(AcpSessionMismatchError)
  })
})
