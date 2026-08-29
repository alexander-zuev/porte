import { describe, expect, it } from 'vitest'

import type { ConversationState } from '../../src/conversation/conversation-view.ts'
import {
  AttemptIdSchema,
  MessageIdSchema,
  PermissionIdSchema,
  ToolCallIdSchema,
  TurnIdSchema,
} from '../../src/identity/identity.ts'
import {
  INITIAL_CONVERSATION_LIVE_STATE,
  liveStateFromConversation,
  reduceLiveState,
} from '../../src/relay/conversation-live-state.ts'

const turnId = TurnIdSchema.parse('c1:turn:0')
const attemptId = AttemptIdSchema.parse('0199f97b-9cf1-7f05-9e9d-df1647d7a821')

describe('reduceLiveState', () => {
  it('records the running turn when it starts and clears it when it finishes', () => {
    const running = reduceLiveState(INITIAL_CONVERSATION_LIVE_STATE, {
      type: 'turn.started',
      turnId,
      attemptId,
    })
    expect(running.runningTurnId).toBe(turnId)
    const idle = reduceLiveState(running, {
      type: 'turn.finished',
      turnId,
      outcome: { type: 'completed', reason: 'completed' },
    })
    expect(idle.runningTurnId).toBeUndefined()
  })

  it('clears pending interactions when the turn finishes', () => {
    const running = reduceLiveState(INITIAL_CONVERSATION_LIVE_STATE, {
      type: 'turn.started',
      turnId,
      attemptId,
    })
    const waiting = reduceLiveState(running, {
      type: 'permission.requested',
      turnId,
      permissionId: PermissionIdSchema.parse(`${turnId}:permission:1`),
      toolCallId: ToolCallIdSchema.parse('tool-1'),
      title: 'Write file',
      options: [{ optionId: 'allow', name: 'Allow', kind: 'allow_once' }],
    })
    expect(waiting.pending.permissions).toHaveLength(1)
    const idle = reduceLiveState(waiting, {
      type: 'turn.finished',
      turnId,
      outcome: { type: 'cancelled' },
    })
    expect(idle.pending).toEqual({ permissions: [], elicitations: [] })
  })

  it('keeps the command list out of the state, unchanged reference included', () => {
    const state = INITIAL_CONVERSATION_LIVE_STATE
    const next = reduceLiveState(state, {
      type: 'conversation.commands.updated',
      commands: [{ name: 'review', description: 'Review the changes' }],
    })
    expect(next).toBe(state)
  })

  it('returns the same reference for an event that changes nothing', () => {
    const state = reduceLiveState(INITIAL_CONVERSATION_LIVE_STATE, {
      type: 'turn.started',
      turnId,
      attemptId,
    })
    const next = reduceLiveState(state, {
      type: 'message.delta',
      turnId,
      messageId: MessageIdSchema.parse(`${turnId}:assistant:1`),
      content: { type: 'text', text: 'hi' },
    })
    expect(next).toBe(state)
  })
})

describe('liveStateFromConversation', () => {
  it('selects the live facts and drops the transcript and commands', () => {
    const state: ConversationState = {
      turn: { state: 'running', turnId },
      items: [],
      tools: [],
      plans: [],
      pending: { permissions: [], elicitations: [] },
      usage: { usedTokens: 1, sizeTokens: 10 },
      commands: [{ name: 'review', description: 'Review the changes' }],
      modeId: 'code',
    }
    expect(liveStateFromConversation(state)).toEqual({
      plans: [],
      pending: { permissions: [], elicitations: [] },
      runningTurnId: turnId,
      usage: { usedTokens: 1, sizeTokens: 10 },
      modeId: 'code',
    })
  })
})
