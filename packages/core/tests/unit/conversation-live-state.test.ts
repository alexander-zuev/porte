import { describe, expect, it } from 'vitest'

import { AttemptIdSchema, MessageIdSchema, TurnIdSchema } from '../../src/identity/identity.ts'
import {
  INITIAL_CONVERSATION_LIVE_STATE,
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
