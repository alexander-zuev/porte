import { readFileSync } from 'node:fs'

import { Conversation } from '@host/domain/conversation/conversation.ts'
import {
  AcpSessionMismatchError,
  AcpUpdateMapper,
  AcpUpdateSequenceError,
} from '@host/infrastructure/acp/acp-update-mapper.ts'
import type { AcpSessionNotification } from '@host/infrastructure/acp/message.ts'
import { ConversationIdSchema, IsoDateTimeSchema, type ConversationEvent } from '@porte/core/client'
import { describe, expect, it } from 'vitest'

function fixture(name: string): AcpSessionNotification[] {
  const url = new URL(`../fixtures/acp/${name}.json`, import.meta.url)
  // SAFETY: fixtures are verbatim `session/update` notifications captured from grok 1.0.5.
  return JSON.parse(readFileSync(url, 'utf8')) as AcpSessionNotification[]
}

const replay = fixture('session-load-replay')
const live = fixture('session-prompt-live')
const conversationId = ConversationIdSchema.parse(replay[0]!.sessionId)

function types(events: readonly ConversationEvent[]): string[] {
  return events.map((event) => event.type)
}

function prompt(promptIndex: number, text: string, hidden = false): AcpSessionNotification {
  return {
    sessionId: conversationId,
    update: {
      sessionUpdate: 'user_message_chunk',
      content: { type: 'text', text },
      _meta: hidden
        ? { modelId: 'grok-4.6', promptIndex, hideFromScrollback: true }
        : { modelId: 'grok-4.6', promptIndex },
    },
  }
}

const reply: AcpSessionNotification = {
  sessionId: conversationId,
  update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'ok' } },
}

const completed = { sessionUpdate: 'turn_completed' as const, stop_reason: 'end_turn' }

function restored(): Conversation {
  return Conversation.restore({
    id: conversationId,
    cwd: '/repo',
    gitRoot: '/repo',
    title: '',
    updatedAt: IsoDateTimeSchema.parse('2026-08-27T12:00:00.000Z'),
  })
}

describe('AcpUpdateMapper', () => {
  it('opens a turn on a typed user chunk and closes it on turn_completed, with usage', () => {
    const mapper = new AcpUpdateMapper(conversationId)
    mapper.setContextTokens(1_000)
    const events = [
      ...mapper.map(prompt(0, 'hi')),
      ...mapper.map(reply),
      ...mapper.completeTurn({ ...completed, usage: { totalTokens: 400 } }),
    ]
    // The user echo closes the moment the answer starts, so a consumer can act on the whole prompt.
    expect(types(events)).toEqual([
      'turn.started',
      'message.started',
      'message.delta',
      'message.completed',
      'message.started',
      'message.delta',
      'message.completed',
      'conversation.usage.updated',
      'turn.finished',
    ])
    expect(events[0]).toMatchObject({ turnId: `${conversationId}:turn:0` })
    expect(events.at(-2)).toMatchObject({ usage: { usedTokens: 400, sizeTokens: 1_000 } })
    expect(events.at(-1)).toMatchObject({ outcome: { type: 'completed', reason: 'completed' } })
    expect(mapper.runningTurnId).toBeUndefined()
  })

  it('maps a cancelled stop reason; a completion with nothing open is a no-op', () => {
    const mapper = new AcpUpdateMapper(conversationId)
    mapper.map(prompt(0, 'stop me'))
    const finished = mapper.completeTurn({ ...completed, stop_reason: 'cancelled' }).at(-1)
    expect(finished).toMatchObject({ type: 'turn.finished', outcome: { type: 'cancelled' } })
    expect(mapper.completeTurn(completed)).toEqual([])
  })

  it('replays a 2-turn load with deterministic ids, boundaries, and one tool.updated per call', () => {
    const mapper = new AcpUpdateMapper(conversationId)
    const events = replay.flatMap((notification) => mapper.map(notification))
    const turnIds = new Set(events.flatMap((event) => ('turnId' in event ? [event.turnId] : [])))
    expect([...turnIds]).toEqual([`${conversationId}:turn:0`, `${conversationId}:turn:1`])
    expect(types(events).filter((type) => type === 'tool.updated')).toHaveLength(2)
    expect(types(events).filter((type) => type === 'turn.started')).toHaveLength(2)
    expect(events[0]).toMatchObject({ type: 'turn.started', turnId: `${conversationId}:turn:0` })
    expect(events[2]).toMatchObject({
      type: 'message.delta',
      messageId: `${conversationId}:turn:0:user`,
    })
  })

  it('a history with no completion for its last turn leaves the conversation running', () => {
    const mapper = new AcpUpdateMapper(conversationId)
    const conversation = restored()
    conversation.replay(replay.flatMap((notification) => mapper.map(notification)))
    const state = conversation.snapshot()
    expect(state.items.map((item) => item.type).join(' ')).toBe(
      'message reasoning message tool reasoning message tool reasoning message message reasoning',
    )
    expect(state.commands).toHaveLength(3)
    // The old capture has no `turn_completed` frames, so the second turn is still open.
    expect(state.turn).toMatchObject({ state: 'running', turnId: `${conversationId}:turn:1` })
    expect(conversation.collectEvents()).toEqual([])
  })

  it('maps a live turn: commands once, streams closed at the end', () => {
    const mapper = new AcpUpdateMapper(conversationId)
    const events = [
      ...mapper.map(prompt(0, 'hi')),
      ...live.flatMap((notification) => mapper.map(notification)),
    ]
    const counts = Map.groupBy(types(events), (type) => type)
    expect(counts.get('conversation.commands.updated')).toHaveLength(1)
    expect(counts.get('tool.updated')).toHaveLength(8)
    expect(types(mapper.completeTurn(completed))).toEqual([
      'reasoning.completed',
      'message.completed',
      'turn.finished',
    ])
  })

  it('keeps the input and the diff when a later update carries null or nothing', () => {
    const mapper = new AcpUpdateMapper(conversationId)
    mapper.map(prompt(0, 'edit'))
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

  it('a hidden chunk keeps its prompt slot but opens no turn and renders nothing', () => {
    // Captured from grok 1.0.13: after a cancel, Grok inserts a hidden reminder as prompt 6.
    const mapper = new AcpUpdateMapper(conversationId)
    mapper.map(prompt(5, 'stop me'))
    mapper.completeTurn({ ...completed, stop_reason: 'cancelled' })
    expect(mapper.map(prompt(6, '<system-reminder>cancelled</system-reminder>', true))).toEqual([])
    expect(mapper.runningTurnId).toBeUndefined()
    const [started] = mapper.map(prompt(7, 'next'))
    expect(started).toMatchObject({ type: 'turn.started', turnId: `${conversationId}:turn:7` })
  })

  it('mints a fresh turn for a repeated promptIndex so the replay folds without raising', () => {
    // Captured from grok 1.0.13: two off-leader processes each numbered a prompt 3.
    const mapper = new AcpUpdateMapper(conversationId)
    const events = [
      ...mapper.map(prompt(3, 'commit')),
      ...mapper.map(reply),
      ...mapper.completeTurn(completed),
      ...mapper.map(prompt(4, 'long')),
      ...mapper.map(reply),
      ...mapper.completeTurn(completed),
      ...mapper.map(prompt(3, 'more')),
      ...mapper.map(reply),
      ...mapper.completeTurn(completed),
    ]
    const turnIds = new Set(events.flatMap((event) => ('turnId' in event ? [event.turnId] : [])))
    expect([...turnIds]).toEqual([
      `${conversationId}:turn:3`,
      `${conversationId}:turn:4`,
      `${conversationId}:turn:5`,
    ])
    const conversation = restored()
    expect(() => {
      conversation.replay(events)
    }).not.toThrow()
    expect(conversation.turn).toEqual({ state: 'idle' })
  })

  it('a new typed chunk while a turn is open ends that turn as failed', () => {
    const mapper = new AcpUpdateMapper(conversationId)
    mapper.map(prompt(0, 'first'))
    const events = mapper.map(prompt(1, 'second'))
    expect(types(events)).toEqual([
      'message.completed',
      'turn.finished',
      'turn.started',
      'message.started',
      'message.delta',
    ])
    expect(events[1]).toMatchObject({ outcome: { type: 'failed' } })
  })

  it('drops content outside a turn (Grok re-broadcasts history) and rejects another session', () => {
    const mapper = new AcpUpdateMapper(conversationId)
    expect(mapper.map(reply)).toEqual([])
    expect(() => mapper.map({ ...reply, sessionId: 'other' })).toThrow(AcpSessionMismatchError)
    // A tool update for a call that never started is still a sequence error inside a turn.
    mapper.map(prompt(0, 'hi'))
    expect(() =>
      mapper.map({
        sessionId: conversationId,
        update: { sessionUpdate: 'tool_call_update', toolCallId: 'ghost', status: 'completed' },
      }),
    ).toThrow(AcpUpdateSequenceError)
  })
})
