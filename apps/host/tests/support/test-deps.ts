import { MessageBus } from '@host/application/message-bus.ts'
import type {
  AgentListener,
  CodingAgent,
  CreatedSession,
  LoadedSession,
  PromptResult,
} from '@host/application/ports/coding-agent.ts'
import type { HostConnections } from '@host/application/ports/host-connections.ts'
import type { WorkspaceChangesReader } from '@host/application/ports/workspace-changes.ts'
import { createAgentInbound } from '@host/entrypoints/acp/acp-inbound.ts'
import type { AppDeps } from '@host/infrastructure/app-deps.ts'
import { NodeBackgroundTasks } from '@host/infrastructure/node/background-tasks.ts'
import { EventOutbox } from '@host/infrastructure/persistence/event-outbox.ts'
import { InMemoryConversationRepository } from '@host/infrastructure/persistence/in-memory-conversation-repository.ts'
import {
  ConversationIdSchema,
  type ChangePatch,
  type ChangedFilePath,
  type ConversationEvent,
  type ConversationId,
  type ConversationMetadataPatch,
  type WorkspaceChanges,
} from '@porte/core/client'
import { vi } from 'vitest'

/**
 * A coding agent that answers from RAM. `prompt` parks until the test settles it,
 * so a turn can be observed while running. Pushes reach `listener` like the real one.
 */
export class FakeCodingAgent implements CodingAgent {
  listener: AgentListener | undefined
  readonly sessions = new Map<ConversationId, string>()
  private readonly prompts = new Map<ConversationId, (result: PromptResult) => void>()
  private nextId = 1

  readonly listSessions = vi.fn(async () => ({ sessions: [] }))
  readonly cancel = vi.fn(async (id: ConversationId) => {
    this.settle(id, { outcome: { type: 'cancelled' } })
  })
  readonly setModel = vi.fn(async (): Promise<readonly ConversationEvent[]> => [])
  readonly closeSession = vi.fn(async (id: ConversationId) => {
    this.sessions.delete(id)
  })
  readonly resolvePermission = vi.fn()
  readonly resolveElicitation = vi.fn()
  readonly stop = vi.fn(async () => undefined)

  async createSession(input: { cwd: string }): Promise<CreatedSession> {
    const id = ConversationIdSchema.parse(`conversation-${String(this.nextId++)}`)
    this.sessions.set(id, input.cwd)
    return { id, events: [] }
  }

  async loadSession(id: ConversationId, cwd: string): Promise<LoadedSession> {
    this.sessions.set(id, cwd)
    return { title: 'Loaded', events: [] }
  }

  isOpen(id: ConversationId): boolean {
    return this.sessions.has(id)
  }

  prompt(id: ConversationId): Promise<PromptResult> {
    return new Promise((resolve) => {
      this.prompts.set(id, resolve)
    })
  }

  /** Let the agent stream events for the running turn. */
  push(id: ConversationId, events: readonly ConversationEvent[]): void {
    this.listener?.onEvents(id, events)
  }

  /** Settle the parked prompt as the agent would. */
  settle(id: ConversationId, result: PromptResult): void {
    const resolve = this.prompts.get(id)
    this.prompts.delete(id)
    resolve?.(result)
  }

  get running(): readonly ConversationId[] {
    return [...this.prompts.keys()]
  }
}

/** Timers a test fires by hand. */
export class FakeScheduler {
  private readonly pending: { delayMs: number; task: () => void }[] = []

  schedule(delayMs: number, task: () => void): void {
    this.pending.push({ delayMs, task })
  }

  /** Run every task scheduled at or under `upToMs`, in schedule order. */
  fire(upToMs: number): void {
    const due = this.pending.filter((entry) => entry.delayMs <= upToMs)
    for (const entry of due) {
      this.pending.splice(this.pending.indexOf(entry), 1)
      entry.task()
    }
  }
}

/** Sockets that record what the host would have sent. */
export class FakeConnections implements HostConnections {
  readonly controlStopped = new Promise<void>(() => undefined)
  readonly updates: { conversationId: ConversationId; update: ConversationMetadataPatch }[] = []
  readonly sent = new Map<ConversationId, ConversationEvent[]>()
  readonly attached = new Map<ConversationId, string>()
  readonly control = {
    conversationUpdated: (conversationId: ConversationId, update: ConversationMetadataPatch) => {
      this.updates.push({ conversationId, update })
    },
  }

  connectControl(): void {}

  connectConversation(conversationId: ConversationId, cwd: string): Promise<void> {
    this.attached.set(conversationId, cwd)
    this.sent.set(conversationId, this.sent.get(conversationId) ?? [])
    return Promise.resolve()
  }

  conversation(conversationId: ConversationId) {
    const events = this.sent.get(conversationId)
    if (events === undefined) return null
    return {
      sendEvent: (event: ConversationEvent) => {
        events.push(event)
      },
    }
  }

  closeConversation(conversationId: ConversationId): void {
    this.sent.delete(conversationId)
    this.attached.delete(conversationId)
  }

  closeAll(): void {
    this.sent.clear()
    this.attached.clear()
  }
}

/** A workspace whose answers a test sets up front, and that records which root was asked. */
export class FakeWorkspaceChanges implements WorkspaceChangesReader {
  readonly asked: string[] = []
  changes: WorkspaceChanges = { branch: 'main', files: [] }
  patches = new Map<ChangedFilePath, ChangePatch>()

  list(gitRoot: string): Promise<WorkspaceChanges> {
    this.asked.push(gitRoot)
    return Promise.resolve(this.changes)
  }

  get(gitRoot: string, path: ChangedFilePath): Promise<ChangePatch> {
    this.asked.push(gitRoot)
    return Promise.resolve(this.patches.get(path) ?? { kind: 'patch', patch: '' })
  }
}

export type TestDeps = AppDeps & {
  codingAgent: FakeCodingAgent
  scheduler: FakeScheduler
  workspaceChanges: FakeWorkspaceChanges
}

/**
 * The real bus, repository, outbox, and background tasks over a fake agent.
 * `connections` is read late so a test can hand in sockets that need the bus first.
 */
export function createTestDeps(
  connections: () => HostConnections = () => new FakeConnections(),
): TestDeps {
  const outbox = new EventOutbox()
  const codingAgent = new FakeCodingAgent()
  const deps: TestDeps = {
    outbox,
    conversations: new InMemoryConversationRepository(outbox),
    codingAgent,
    workspaceChanges: new FakeWorkspaceChanges(),
    background: new NodeBackgroundTasks(),
    scheduler: new FakeScheduler(),
    now: () => new Date('2026-08-27T12:00:00.000Z'),
    get bus() {
      return bus
    },
    get connections() {
      return connections()
    },
  }
  const bus = new MessageBus(deps)
  codingAgent.listener = createAgentInbound(bus, deps.background)
  return deps
}
