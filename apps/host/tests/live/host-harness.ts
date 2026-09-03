import { MessageBus } from '@host/application/message-bus.ts'
import { createCommand } from '@host/domain/messages/types.ts'
import { createAgentInbound } from '@host/entrypoints/acp/acp-inbound.ts'
import { AcpCodingAgent } from '@host/infrastructure/acp/acp-coding-agent.ts'
import type { AppDeps } from '@host/infrastructure/app-deps.ts'
import { GitWorkingTree } from '@host/infrastructure/git/git-working-tree.ts'
import { startGrok } from '@host/infrastructure/grok/grok-launch.ts'
import { NodeBackgroundTasks } from '@host/infrastructure/node/background-tasks.ts'
import { NodeScheduler } from '@host/infrastructure/node/scheduler.ts'
import { EventOutbox } from '@host/infrastructure/persistence/event-outbox.ts'
import { InMemoryAttemptBindings } from '@host/infrastructure/persistence/in-memory-attempt-bindings.ts'
import { InMemoryConversationRepository } from '@host/infrastructure/persistence/in-memory-conversation-repository.ts'
import { MessageIdSchema, type ConversationEvent, type ConversationId } from '@porte/core/client'
import { expect, vi } from 'vitest'

import { FakeConnections } from '../support/test-deps.ts'

/** One live turn may run tools; the model may also be slow. */
export const GROK_TIMEOUT_MS = 180_000

/** The Host as `porte up` runs it, with the relay sockets replaced by a recorder. */
export type HostHarness = AppDeps & { connections: FakeConnections }

/**
 * Run `body` against a Host wired to real Grok: real bus, real handlers, real
 * `AcpCodingAgent`. Conversations close and background work drains afterwards.
 */
export async function withHost(body: (deps: HostHarness) => Promise<void>): Promise<void> {
  const shutdown = new AbortController()
  const outbox = new EventOutbox()
  const deps: HostHarness = {
    outbox,
    conversations: new InMemoryConversationRepository(outbox),
    attempts: new InMemoryAttemptBindings(),
    workingTree: new GitWorkingTree(),
    connections: new FakeConnections(),
    background: new NodeBackgroundTasks(),
    scheduler: new NodeScheduler(),
    now: () => new Date(),
    get bus() {
      return bus
    },
    get codingAgent() {
      return codingAgent
    },
  }
  const bus = new MessageBus(deps)
  const codingAgent = await AcpCodingAgent.start(
    (callbacks) => startGrok(shutdown.signal, callbacks),
    createAgentInbound(bus, deps.background),
  )
  try {
    await body(deps)
  } finally {
    await bus.handle(createCommand('CloseAllConversations', {}))
    await deps.background.drain()
    shutdown.abort()
  }
}

/** A browser-shaped user message for `StartTurn`. */
export function userMessage(text: string) {
  return { id: MessageIdSchema.parse(`${text}:user`), content: [{ type: 'text' as const, text }] }
}

/** Every event the Host sent to the relay for one conversation so far. */
export function sentEvents(deps: HostHarness, conversationId: ConversationId): ConversationEvent[] {
  return deps.connections.sent.get(conversationId) ?? []
}

/** Resolve once the relay recorder holds an event matching `predicate`. */
export async function sentEvent<Type extends ConversationEvent['type']>(
  deps: HostHarness,
  conversationId: ConversationId,
  type: Type,
  predicate: (event: Extract<ConversationEvent, { type: Type }>) => boolean = () => true,
): Promise<Extract<ConversationEvent, { type: Type }>> {
  const ofType = (event: ConversationEvent): event is Extract<ConversationEvent, { type: Type }> =>
    event.type === type
  let found: Extract<ConversationEvent, { type: Type }> | undefined
  await vi.waitFor(
    () => {
      found = sentEvents(deps, conversationId).filter(ofType).find(predicate)
      expect(found).toBeDefined()
    },
    { timeout: 120_000, interval: 250 },
  )
  if (found === undefined) throw new TypeError('unreachable: waitFor settled without a match')
  return found
}

/** Resolve once the Host reported the end of `turnId`, or of any turn when omitted. */
export async function turnFinished(
  deps: HostHarness,
  conversationId: ConversationId,
): Promise<Extract<ConversationEvent, { type: 'turn.finished' }>> {
  return sentEvent(deps, conversationId, 'turn.finished')
}
