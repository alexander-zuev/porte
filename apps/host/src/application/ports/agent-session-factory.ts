import type { AgentSession } from '@host/application/ports/agent-session.ts'
import type { Conversation, ConversationEmission, ConversationId } from '@porte/core/client'

export type AgentSessionListener = (emission: ConversationEmission) => void

export type OpenAgentSession = {
  readonly conversationId: ConversationId
  readonly listener: AgentSessionListener
}

export type CreateAgentSession = {
  readonly cwd: string
  readonly listener: AgentSessionListener
}

export type CreatedAgentSession = {
  readonly conversation: Conversation
  readonly session: AgentSession
}

/** Creates one coding-agent process for one conversation. */
export interface AgentSessionFactory {
  list(): Promise<Conversation[]>
  open(command: OpenAgentSession): Promise<AgentSession>
  create(command: CreateAgentSession): Promise<CreatedAgentSession>
}
