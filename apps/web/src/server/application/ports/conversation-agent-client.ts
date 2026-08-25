import type { ConversationId } from '@porte/core'

import type { AgentConnection } from './agent-connection.ts'

export type ConnectConversationAgent = AgentConnection & {
  readonly conversationId: ConversationId
}

/** Cloudflare capability required to connect one conversation child Agent. */
export interface IConversationAgentClient {
  connect(input: ConnectConversationAgent): Promise<Response>
}
