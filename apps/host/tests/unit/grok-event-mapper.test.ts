import {
  EventIdSchema,
  MessageIdSchema,
  PermissionIdSchema,
  ConversationIdSchema,
  TurnIdSchema,
} from '@porte/core'
import { describe, expect, it } from 'vitest'

import { GrokEventMapper, GrokReplayMapper } from '../../src/adapters/grok/grok-event-mapper.ts'

const sessionId = ConversationIdSchema.parse('session-1')
const turnId = TurnIdSchema.parse('0198b55e-49d6-7e0f-9917-b08777b451b9')

describe('GrokEventMapper', () => {
  it('maps one streamed message lifecycle', () => {
    const mapper = createMapper()
    const started = mapper.start('Question')
    const chunk = mapper.map({
      sessionId,
      update: {
        sessionUpdate: 'agent_message_chunk',
        messageId: 'message-1',
        content: { type: 'text', text: 'Done' },
      },
    })
    const finished = mapper.finish('end_turn')

    expect(eventTypes(started, chunk, finished)).toEqual([
      'turn.started',
      'message.started',
      'message.delta',
      'message.completed',
      'message.started',
      'message.delta',
      'message.completed',
      'turn.finished',
    ])
  })

  it('uses the submitted prompt instead of the ACP echo', () => {
    const mapper = createMapper()
    const started = mapper.start('Question')
    const echoed = mapper.map({
      sessionId,
      update: {
        sessionUpdate: 'user_message_chunk',
        content: { type: 'text', text: 'Question' },
      },
    })

    expect(eventTypes(started, echoed)).toEqual([
      'turn.started',
      'message.started',
      'message.delta',
      'message.completed',
    ])
  })

  it('maps full tool state from partial updates', () => {
    const mapper = createMapper()
    mapper.start('Question')
    mapper.map({
      sessionId,
      update: { sessionUpdate: 'tool_call', toolCallId: 'tool-1', title: 'Change mode' },
    })
    const mapped = mapper.map({
      sessionId,
      update: {
        sessionUpdate: 'tool_call_update',
        toolCallId: 'tool-1',
        kind: 'switch_mode',
        status: 'completed',
        content: [{ type: 'terminal', terminalId: 'terminal-1' }],
      },
    })

    expect(mapped.isOk() && mapped.value[0]).toMatchObject({
      type: 'tool.updated',
      tool: { kind: 'switch_mode', status: 'completed', content: [{ type: 'terminal' }] },
    })
  })

  it('maps ACP controls and conversation progress', () => {
    const mapper = createMapper()
    mapper.start('Question')
    const mode = mapper.map({
      sessionId,
      update: { sessionUpdate: 'current_mode_update', currentModeId: 'code' },
    })
    const usage = mapper.map({
      sessionId,
      update: { sessionUpdate: 'usage_update', used: 50, size: 100 },
    })

    expect(eventTypes(mode, usage)).toEqual([
      'conversation.mode.updated',
      'conversation.usage.updated',
    ])
  })

  it('separates messages around a tool call', () => {
    const mapper = createMapper()
    mapper.start('Question')
    mapper.map(replayChunk('agent_message_chunk', 'Before'))
    const tool = mapper.map({
      sessionId,
      update: { sessionUpdate: 'tool_call', toolCallId: 'tool-1', title: 'Read file' },
    })
    const after = mapper.map(replayChunk('agent_message_chunk', 'After'))

    expect(eventTypes(tool, after)).toEqual([
      'message.completed',
      'tool.updated',
      'message.started',
      'message.delta',
    ])
  })

  it('maps permission cancellation', () => {
    const mapper = createMapper()
    mapper.start('Question')
    const permissionId = PermissionIdSchema.parse('0198b55e-49d6-7e0f-9917-b08777b451c0')
    const cancelled = mapper.permissionCancelled(permissionId)

    expect(cancelled.isOk() && cancelled.value[0]).toMatchObject({
      type: 'permission.resolved',
      outcome: { type: 'cancelled' },
    })
  })

  it('rejects updates for another conversation', () => {
    const mapper = createMapper()
    mapper.start('Question')
    const mapped = mapper.map({
      sessionId: 'session-2',
      update: { sessionUpdate: 'plan', entries: [] },
    })

    expect(mapped.isErr() && mapped.error.code).toBe('SESSION_MISMATCH')
  })

  it('builds a complete view from load updates', () => {
    const replay = new GrokReplayMapper(createIds())
    replay.map(replayChunk('user_message_chunk', 'Question'))
    replay.map(replayChunk('agent_message_chunk', 'Answer'))
    replay.map({
      sessionId,
      update: { sessionUpdate: 'tool_call', toolCallId: 'tool-1', title: 'Read file' },
    })
    replay.map({
      sessionId,
      update: { sessionUpdate: 'usage_update', used: 25, size: 100 },
    })

    const view = replay.snapshot(sessionId)
    expect(view.isOk() && view.value).toMatchObject({
      items: [
        { type: 'message', role: 'user' },
        { type: 'message', role: 'assistant' },
        { type: 'tool' },
      ],
      tools: [{ toolCallId: 'tool-1' }],
      usage: { usedTokens: 25, sizeTokens: 100 },
    })
  })

  it('rejects replay updates from two conversations', () => {
    const replay = new GrokReplayMapper(createIds())
    replay.map(replayChunk('user_message_chunk', 'Question'))
    const mapped = replay.map({
      sessionId: 'session-2',
      update: { sessionUpdate: 'plan', entries: [] },
    })

    expect(mapped.isErr() && mapped.error.code).toBe('SESSION_MISMATCH')
  })
})

function createMapper(): GrokEventMapper {
  return new GrokEventMapper(sessionId, turnId, createIds())
}

function createIds() {
  let event = 0
  let message = 0
  return {
    eventId: () => EventIdSchema.parse(`event-${String(++event)}`),
    messageId: () => MessageIdSchema.parse(`message-${String(++message)}`),
    permissionId: () => PermissionIdSchema.parse('0198b55e-49d6-7e0f-9917-b08777b451c0'),
  }
}

function replayChunk(sessionUpdate: 'user_message_chunk' | 'agent_message_chunk', text: string) {
  return { sessionId, update: { sessionUpdate, content: { type: 'text' as const, text } } }
}

type MappingResult = ReturnType<GrokEventMapper['map']>

function eventTypes(...results: readonly MappingResult[]): string[] {
  return results.flatMap((result) => (result.isOk() ? result.value.map((event) => event.type) : []))
}
