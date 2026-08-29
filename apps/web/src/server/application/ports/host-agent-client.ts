import type {
  ConversationSummary,
  HostId,
  ListConversationsParams,
  ListConversationsResult,
} from '@porte/core'

import type { AgentConnection } from './agent-connection.ts'

/** Cloudflare binding capability required for one host connection. */
export interface IHostRelayClient {
  connect(input: AgentConnection): Promise<Response>

  /** One page of what a machine has reported, newest first. */
  readConversations(
    hostId: HostId,
    query: ListConversationsParams,
  ): Promise<ListConversationsResult>

  /** Open a new coding-agent session in `cwd` on the machine. Not repeatable: each call is one session. */
  createConversation(hostId: HostId, params: { readonly cwd: string }): Promise<ConversationSummary>

  /**
   * Turn everyone out of one machine's relay.
   *
   * Refusing the next connection is not enough: a daemon already holding a
   * socket would keep serving a pairing that has ended.
   */
  disconnect(hostId: HostId): Promise<void>
}
