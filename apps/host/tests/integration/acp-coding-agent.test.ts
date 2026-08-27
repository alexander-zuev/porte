import type { AgentListener } from '@host/application/ports/coding-agent-port.ts'
import { AcpCodingAgent } from '@host/infrastructure/acp/acp-coding-agent.ts'
import { startGrok } from '@host/infrastructure/grok/grok-launch.ts'
import {
  ConversationIdSchema,
  ConversationNotFoundError,
  createTurnId,
  type ConversationEvent,
} from '@porte/core/client'
import { describe, expect, it, vi } from 'vitest'

import { createGitWorkspace, grokOnPath } from './grok-resources.ts'

const GROK_TIMEOUT_MS = 180_000
const PING = [{ type: 'text' as const, text: 'Reply with exactly: ping' }]

type Harness = { agent: AcpCodingAgent; listener: AgentListener; pushed: ConversationEvent[] }

async function withAgent(body: (harness: Harness) => Promise<void>): Promise<void> {
  const shutdown = new AbortController()
  const pushed: ConversationEvent[] = []
  const listener: AgentListener = {
    onEvents: (_id, events) => pushed.push(...events),
    onPermissionRequest: vi.fn(),
    onElicitationRequest: vi.fn(),
    onElicitationComplete: vi.fn(),
  }
  const agent = await AcpCodingAgent.start(
    (callbacks) => startGrok(shutdown.signal, callbacks),
    listener,
  )
  try {
    await body({ agent, listener, pushed })
  } finally {
    await agent.stop()
    shutdown.abort()
  }
}

describe.skipIf(!grokOnPath())('AcpCodingAgent', () => {
  it(
    'creates a session, runs one prompt to completion, and streams the assistant reply',
    async () => {
      await withAgent(async ({ agent, pushed }) => {
        const created = await agent.createSession({ cwd: await createGitWorkspace() })
        expect(created.events[0]).toMatchObject({ type: 'conversation.configuration.updated' })
        const result = await agent.prompt(created.id, createTurnId(), PING)
        expect(result.outcome).toEqual({ type: 'completed', reason: 'completed' })
        expect(result.usage?.sizeTokens).toBeGreaterThan(0)
        expect(pushed.some((event) => event.type === 'message.delta')).toBe(true)
        expect(pushed.at(-1)?.type).toBe('message.completed')
      })
    },
    GROK_TIMEOUT_MS,
  )

  it(
    'loads a closed session as replay events and rejects prompts on unknown sessions',
    async () => {
      await withAgent(async ({ agent }) => {
        const cwd = await createGitWorkspace()
        const created = await agent.createSession({ cwd })
        await agent.prompt(created.id, createTurnId(), PING)
        await agent.closeSession(created.id)
        await expect(agent.prompt(created.id, createTurnId(), PING)).rejects.toBeInstanceOf(
          ConversationNotFoundError,
        )
        const loaded = await agent.loadSession(created.id, cwd)
        expect(loaded.events[0]).toMatchObject({ type: 'message.started', role: 'user' })
        expect(loaded.events.filter((event) => event.type === 'message.started')).toHaveLength(2)
      })
    },
    GROK_TIMEOUT_MS,
  )

  it(
    'cancels an in-flight prompt and reports the cancelled outcome',
    async () => {
      await withAgent(async ({ agent }) => {
        const created = await agent.createSession({ cwd: await createGitWorkspace() })
        const turn = agent.prompt(created.id, createTurnId(), [
          { type: 'text', text: 'Write a long essay about git rebase.' },
        ])
        await agent.cancel(created.id)
        await expect(turn).resolves.toMatchObject({ outcome: { type: 'cancelled' } })
      })
    },
    GROK_TIMEOUT_MS,
  )

  it(
    'setModel answers with the model list and the new current value',
    async () => {
      await withAgent(async ({ agent }) => {
        const created = await agent.createSession({ cwd: await createGitWorkspace() })
        const [configuration] = created.events
        if (configuration?.type !== 'conversation.configuration.updated')
          throw new Error('no models')
        const [option] = configuration.options
        if (option?.type !== 'select') throw new Error('no model option')
        const events = await agent.setModel(created.id, option.currentValue)
        expect(events[0]).toMatchObject({
          type: 'conversation.configuration.updated',
          options: [{ id: 'model', currentValue: option.currentValue }],
        })
        await expect(
          agent.setModel(ConversationIdSchema.parse('missing'), 'x'),
        ).rejects.toBeInstanceOf(ConversationNotFoundError)
      })
    },
    GROK_TIMEOUT_MS,
  )
})
