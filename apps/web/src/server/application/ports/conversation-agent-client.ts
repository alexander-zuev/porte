import type { ConversationId, HostId } from '@porte/core'
import type { UIMessage } from 'ai'

import type { AgentConnection } from './agent-connection.ts'

export type ConnectConversationAgent = AgentConnection & {
  readonly conversationId: ConversationId
}

/** Names one conversation child Agent; a read lends no request. */
export type ReadConversationMessages = {
  readonly hostId: HostId
  readonly conversationId: ConversationId
}

/** Cloudflare capability required to reach one conversation child Agent. */
export interface IConversationAgentClient {
  connect(input: ConnectConversationAgent): Promise<Response>

  /**
   * One conversation's stored messages, as the child Agent serves them.
   *
   * The snapshot a page needs before its socket has said anything; the socket
   * carries every later change. An empty store syncs from the machine first,
   * so the result throws `HostOfflineError` rather than faking an empty one.
   */
  readMessages(input: ReadConversationMessages): Promise<UIMessage[]>
}
