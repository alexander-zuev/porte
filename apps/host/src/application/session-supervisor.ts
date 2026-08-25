import type { AgentSession } from '@host/application/ports/agent-session.ts'
import type { CodingAgent } from '@host/application/ports/coding-agent.ts'
import {
  CodingAgentUnavailableError,
  ConversationNotFoundError,
  type ConversationId,
  type ConversationSummary,
} from '@porte/core/client'

/** Owns every active coding-agent session in one Host process. */
export class SessionSupervisor {
  private readonly sessions = new Map<ConversationId, AgentSession>()
  private readonly opening = new Map<ConversationId, Promise<AgentSession>>()
  private closed = false

  constructor(private readonly codingAgent: CodingAgent) {}

  async openConversation(conversationId: ConversationId): Promise<AgentSession> {
    this.requireOpen()
    const current = this.sessions.get(conversationId)
    if (current !== undefined) return current

    let pending = this.opening.get(conversationId)
    if (pending === undefined) {
      pending = this.openSession(conversationId)
      this.opening.set(conversationId, pending)
    }

    try {
      const session = await pending
      this.requireOpen()
      return session
    } finally {
      if (this.opening.get(conversationId) === pending) this.opening.delete(conversationId)
    }
  }

  async createConversation(cwd: string): Promise<ConversationSummary> {
    this.requireOpen()
    const created = await this.codingAgent.createConversation(cwd)
    if (this.closed) {
      await created.session.close()
      throw new CodingAgentUnavailableError({ cause: undefined })
    }
    this.adopt(created.session)
    return created.conversation
  }

  async closeConversation(conversationId: ConversationId): Promise<void> {
    const session = this.sessions.get(conversationId)
    if (session === undefined) return
    this.sessions.delete(conversationId)
    await session.close()
  }

  getSession(conversationId: ConversationId): AgentSession {
    this.requireOpen()
    const session = this.sessions.get(conversationId)
    if (session === undefined) throw new ConversationNotFoundError()
    return session
  }

  async closeAll(): Promise<void> {
    if (this.closed) return
    this.closed = true
    const sessions = [...this.sessions.values()]
    const opening = [...this.opening.values()]
    this.sessions.clear()
    this.opening.clear()

    const closed = await Promise.allSettled([
      ...sessions.map((session) => session.close()),
      ...opening.map(async (pending) => (await pending).close()),
    ])
    const failed = closed.find((result) => result.status === 'rejected')
    if (failed !== undefined) {
      throw new CodingAgentUnavailableError({ cause: failed.reason })
    }
  }

  private async openSession(conversationId: ConversationId): Promise<AgentSession> {
    const session = await this.codingAgent.openConversation(conversationId)
    if (this.closed) {
      await session.close()
      throw new CodingAgentUnavailableError({ cause: undefined })
    }
    this.adopt(session)
    return session
  }

  private adopt(session: AgentSession): void {
    this.sessions.set(session.conversationId, session)
    session.onClose(() => {
      if (this.sessions.get(session.conversationId) === session) {
        this.sessions.delete(session.conversationId)
      }
    })
  }

  private requireOpen(): void {
    if (this.closed) throw new CodingAgentUnavailableError({ cause: undefined })
  }
}

/** Public operations exposed by the session supervisor. */
export type SessionOperations = Pick<
  SessionSupervisor,
  'openConversation' | 'createConversation' | 'getSession' | 'closeConversation' | 'closeAll'
>
