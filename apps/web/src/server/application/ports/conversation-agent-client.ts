import type { ConversationId } from '@porte/core'

import type { AgentConnection } from './agent-connection.ts'

export type ConnectConversationAgent = AgentConnection & {
  readonly conversationId: ConversationId
}

/** Cloudflare capability required to reach one conversation child Agent. */
export interface IConversationAgentClient {
  connect(input: ConnectConversationAgent): Promise<Response>

  /**
   * One conversation's stored messages, as the child Agent serves them.
   *
   * The snapshot a page needs before its socket has said anything. The socket
   * carries every later change, so nothing here polls.
   */
  readMessages(input: ConnectConversationAgent): Promise<Response>
}
