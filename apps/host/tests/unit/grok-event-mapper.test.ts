import {
  GrokEventMapper,
  GrokEventValueError,
  GrokReplayMapper,
  GrokSessionMismatchError,
} from '@host/infrastructure/grok/grok-event-mapper.ts'
import {
  MessageIdSchema,
  PermissionIdSchema,
  ConversationIdSchema,
  TurnIdSchema,
} from '@porte/core/client'
import { describe, expect, it } from 'vitest'

const sessionId = ConversationIdSchema.parse('session-1')
const turnId = TurnIdSchema.parse('0198b55e-49d6-7e0f-9917-b08777b451b9')

describe('GrokEventMapper', () => {
  it('maps one streamed message lifecycle', () => {
    const mapper = createMapper()
    const started = mapper.start(userMessage())
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
    const started = mapper.start(userMessage())
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
    mapper.start(userMessage())
    mapper.map({
      sessionId,
      update: { sessionUpdate: 'tool_call', toolCallId: 'tool-1', title: 'Change mode' },
    })
    const mapped = mapper.map({
      sessionId,
      update: {
        sessionUpdate: 'tool_call_update',
        toolCallId: 'tool-1',
        name: 'switch_mode',
        kind: 'switch_mode',
        status: 'completed',
        rawInput: { mode: 'code' },
        rawOutput: { changed: true },
        content: [{ type: 'terminal', terminalId: 'terminal-1' }],
      },
    })

    expect(mapped[0]).toMatchObject({
      type: 'tool.updated',
      tool: {
        name: 'switch_mode',
        kind: 'switch_mode',
        status: 'completed',
        rawInput: { mode: 'code' },
        rawOutput: { changed: true },
        content: [{ type: 'terminal' }],
      },
    })
  })

  it('maps ACP controls and conversation progress', () => {
    const mapper = createMapper()
    mapper.start(userMessage())
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

  it('maps ID-addressed ACP plans', () => {
    const mapper = createMapper()
    mapper.start(userMessage())
    const updated = mapper.map({
      sessionId,
      update: {
        sessionUpdate: 'plan_update',
        plan: { type: 'markdown', planId: 'review', content: '# Review' },
      },
    })
    const removed = mapper.map({
      sessionId,
      update: { sessionUpdate: 'plan_removed', planId: 'review' },
    })

    expect(updated[0]).toMatchObject({
      type: 'plan.updated',
      plan: { type: 'markdown', planId: 'review', content: '# Review' },
    })
    expect(removed[0]).toMatchObject({
      type: 'plan.removed',
      planId: 'review',
    })
  })

  it('rejects unadvertised compaction updates', () => {
    const mapper = createMapper()
    mapper.start(userMessage())
    expect(() =>
      mapper.map({
        sessionId,
        update: {
          sessionUpdate: 'compaction_update',
          compactionId: 'compact-1',
          status: 'in_progress',
        },
      }),
    ).toThrow(GrokEventValueError)
  })

  it('separates messages around a tool call', () => {
    const mapper = createMapper()
    mapper.start(userMessage())
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
    mapper.start(userMessage())
    const permissionId = PermissionIdSchema.parse('0198b55e-49d6-7e0f-9917-b08777b451c0')
    const cancelled = mapper.permissionCancelled(permissionId)

    expect(cancelled[0]).toMatchObject({
      type: 'permission.resolved',
      outcome: { type: 'cancelled' },
    })
  })

  it('rejects updates for another conversation', () => {
    const mapper = createMapper()
    mapper.start(userMessage())
    expect(() =>
      mapper.map({
        sessionId: 'session-2',
        update: { sessionUpdate: 'plan', entries: [] },
      }),
    ).toThrow(GrokSessionMismatchError)
  })

  it('builds a complete view from load updates', () => {
    const replay = new GrokReplayMapper()
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
    expect(view).toMatchObject({
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
    const replay = new GrokReplayMapper()
    replay.map(replayChunk('user_message_chunk', 'Question'))
    expect(() => {
      replay.map({
        sessionId: 'session-2',
        update: { sessionUpdate: 'plan', entries: [] },
      })
    }).toThrow(GrokSessionMismatchError)
  })
})

function createMapper(): GrokEventMapper {
  return new GrokEventMapper(sessionId, turnId)
}

function userMessage() {
  return {
    id: MessageIdSchema.parse('message-user'),
    content: [{ type: 'text' as const, text: 'Question' }],
  }
}

function replayChunk(sessionUpdate: 'user_message_chunk' | 'agent_message_chunk', text: string) {
  return { sessionId, update: { sessionUpdate, content: { type: 'text' as const, text } } }
}

type MappingResult = ReturnType<GrokEventMapper['map']>

function eventTypes(...results: readonly MappingResult[]): string[] {
  return results.flatMap((result) => result.map((event) => event.type))
}
