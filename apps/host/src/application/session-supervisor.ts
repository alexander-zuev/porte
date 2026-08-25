import type {
  AgentSessionFactory,
  AgentSessionListener,
} from '@host/application/ports/agent-session-factory.ts'
import type {
  AgentSession,
  AnswerElicitation,
  AnswerPermission,
  SetConfiguration,
  StartTurn,
} from '@host/application/ports/agent-session.ts'
import {
  CodingAgentUnavailableError,
  ConversationNotFoundError,
  type Conversation,
  type ConversationId,
  type ConversationState,
  type TurnId,
} from '@porte/core/client'

const ignoreEmission: AgentSessionListener = () => undefined

/** Owns every active coding-agent session in one Host process. */
export class SessionSupervisor {
  private readonly sessions = new Map<ConversationId, AgentSession>()
  private readonly opening = new Map<ConversationId, Promise<AgentSession>>()
  private closed = false

  constructor(private readonly factory: AgentSessionFactory) {}

  async openConversation(
    conversationId: ConversationId,
    listener: AgentSessionListener,
  ): Promise<ConversationState> {
    this.requireOpen()
    const current = this.sessions.get(conversationId)
    if (current !== undefined) {
      current.setListener(listener)
      return current.state
    }

    let pending = this.opening.get(conversationId)
    if (pending === undefined) {
      pending = this.openSession(conversationId)
      this.opening.set(conversationId, pending)
    }

    try {
      const session = await pending
      this.requireOpen()
      session.setListener(listener)
      return session.state
    } finally {
      if (this.opening.get(conversationId) === pending) this.opening.delete(conversationId)
    }
  }

  async createConversation(cwd: string): Promise<Conversation> {
    this.requireOpen()
    const created = await this.factory.create({ cwd, listener: ignoreEmission })
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

  async startTurn(command: StartTurn): Promise<void> {
    await this.requireSession(command.conversationId).startTurn(command)
  }

  async cancelTurn(conversationId: ConversationId, turnId: TurnId): Promise<void> {
    await this.requireSession(conversationId).cancelTurn(turnId)
  }

  async setConfiguration(command: SetConfiguration): Promise<void> {
    await this.requireSession(command.conversationId).setConfiguration(command)
  }

  async answerPermission(command: AnswerPermission): Promise<void> {
    await this.requireSession(command.conversationId).answerPermission(command)
  }

  async answerElicitation(command: AnswerElicitation): Promise<void> {
    await this.requireSession(command.conversationId).answerElicitation(command)
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
    const session = await this.factory.open({ conversationId, listener: ignoreEmission })
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

  private requireSession(conversationId: ConversationId): AgentSession {
    this.requireOpen()
    const session = this.sessions.get(conversationId)
    if (session === undefined) throw new ConversationNotFoundError()
    return session
  }

  private requireOpen(): void {
    if (this.closed) throw new CodingAgentUnavailableError({ cause: undefined })
  }
}

/** Public operations exposed by the session supervisor. */
export type SessionOperations = Pick<
  SessionSupervisor,
  | 'openConversation'
  | 'createConversation'
  | 'closeConversation'
  | 'startTurn'
  | 'cancelTurn'
  | 'setConfiguration'
  | 'answerPermission'
  | 'answerElicitation'
  | 'closeAll'
>
