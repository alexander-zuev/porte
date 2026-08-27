import { readFileSync } from 'node:fs'

import type { ListSessionsResponse, LoadSessionResponse } from '@agentclientprotocol/sdk'
import { Conversation } from '@host/domain/conversation/conversation.ts'
import { parseSessionModels } from '@host/infrastructure/acp/acp-content.ts'
import { AcpUpdateMapper } from '@host/infrastructure/acp/acp-update-mapper.ts'
import type { AcpSessionNotification } from '@host/infrastructure/acp/message.ts'
import { toSessionFacts } from '@host/infrastructure/grok/grok-session.ts'
import { ConversationIdSchema, IsoDateTimeSchema } from '@porte/core/client'
import { describe, expect, it } from 'vitest'

/**
 * Real `/porte` conversation captured from grok 1.0.5 and cut down by
 * `scripts/clean-acp-fixtures.ts`: 5 real turns (0, 1, 2, 6, 72), the repeated
 * `promptIndex` on turn 72, three legacy `plan` updates, one commands update.
 */
function fixture<T>(name: string): T {
  const url = new URL(`../fixtures/acp/${name}.json`, import.meta.url)
  // SAFETY: fixtures are verbatim ACP payloads captured from grok 1.0.5.
  return JSON.parse(readFileSync(url, 'utf8')) as T
}

const replay = fixture<AcpSessionNotification[]>('porte-session-load')
const loadResponse = fixture<LoadSessionResponse>('porte-session-load-response')
const listed = fixture<ListSessionsResponse>('porte-session-list')
const conversationId = ConversationIdSchema.parse(replay[0]!.sessionId)

function replayed(): Conversation {
  const mapper = new AcpUpdateMapper(conversationId)
  const conversation = Conversation.restore({
    id: conversationId,
    cwd: '/Users/az/projects/porte',
    gitRoot: '/Users/az/projects/porte/',
    title: '',
    updatedAt: IsoDateTimeSchema.parse('2026-08-27T00:00:00.000Z'),
  })
  conversation.replay(replay.flatMap((notification) => mapper.map(notification)))
  return conversation
}

describe('real /porte conversation', () => {
  it('replays five turns keyed by promptIndex, one user message per turn', () => {
    const state = replayed().snapshot()
    const users = state.items.flatMap((item) =>
      item.type === 'message' && item.role === 'user' ? [item] : [],
    )
    expect(users.map((item) => item.messageId)).toEqual(
      [0, 1, 2, 6, 72].map((index) => `${conversationId}:turn:${String(index)}:user`),
    )
    // Turn 72 carried two user chunks with the same promptIndex: one message, two deltas.
    expect(users.at(-1)).toMatchObject({ content: [{ type: 'text' }, { type: 'text' }] })
  })

  it('folds tool calls, legacy plans, and commands into the view', () => {
    const state = replayed().snapshot()
    expect(state.tools).toHaveLength(24)
    // Replayed tool calls arrive final: completed or failed, never pending.
    expect(state.tools.some((tool) => tool.status === 'pending')).toBe(false)
    expect(state.plans).toEqual([expect.objectContaining({ type: 'items', planId: 'legacy' })])
    expect(state.commands).toHaveLength(3)
    expect(state.pending).toEqual({ permissions: [], elicitations: [] })
  })

  it('reads list rows and the load response the way the host needs them', () => {
    const facts = listed.sessions.map(toSessionFacts)
    expect(facts.map((row) => row?.gitRoot)).toEqual([
      '/Users/az/projects/porte',
      '/Users/az/projects/porte',
    ])
    expect(parseSessionModels(loadResponse)?.currentModelId).toBe('grok-4.6')
  })
})
