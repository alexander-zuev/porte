import type {
  HostId,
  HostStatus,
  ListConversationsParams,
  ListConversationsResult,
} from '@porte/core'

import type { AgentConnection } from './agent-connection.ts'

/** Cloudflare binding capability required for one host connection. */
export interface IHostRelayClient {
  connect(input: AgentConnection): Promise<Response>

  /** One page of what a Mac has reported, newest first. */
  readConversations(
    hostId: HostId,
    query: ListConversationsParams,
  ): Promise<ListConversationsResult>

  /** Whether the relay holds the Mac's socket. The only liveness anything can see. */
  readStatus(hostId: HostId): Promise<HostStatus>

  /**
   * Turn everyone out of one Mac's relay.
   *
   * Refusing the next connection is not enough: a daemon already holding a
   * socket would keep serving a pairing that has ended.
   */
  disconnect(hostId: HostId): Promise<void>
}
