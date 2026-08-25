import type { AgentSession } from '@host/application/ports/agent-session.ts'
import type {
  ConversationCursor,
  ConversationId,
  ConversationSummary,
  ListConversationsResult,
} from '@porte/core/client'

/** Optional provider capabilities that every Porte coding agent must support. */
export const REQUIRED_CODING_AGENT_CAPABILITIES = [
  'conversation.list',
  'conversation.open',
] as const

export type RequiredCodingAgentCapability = (typeof REQUIRED_CODING_AGENT_CAPABILITIES)[number]

export type CreatedAgentConversation = {
  readonly conversation: ConversationSummary
  readonly session: AgentSession
}

/** Provides conversation operations for one coding agent. */
export interface CodingAgent {
  listConversations(cursor?: ConversationCursor): Promise<ListConversationsResult>
  openConversation(conversationId: ConversationId): Promise<AgentSession>
  createConversation(cwd: string): Promise<CreatedAgentConversation>
}
