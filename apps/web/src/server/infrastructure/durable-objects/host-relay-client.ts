import type {
  HostId,
  HostStatus,
  ListConversationsParams,
  ListConversationsResult,
} from '@porte/core'
import { DurableObjectClient, HOST_CONTROL_SUBPROTOCOL } from '@porte/core'
import type { AgentConnection } from '@server/application/ports/agent-connection.ts'
import type { IHostRelayClient } from '@web/server/application/ports/host-agent-client.ts'

import type { HostRelayAgent } from './host-relay-agent.ts'
import { createRelayUpgradeRequest } from './relay/relay-upgrade-request.ts'
import { completeRelayUpgrade } from './relay/relay-upgrade-response.ts'

/**
 * How the Worker reaches one Mac's relay.
 *
 * The relay's own types come through each call, so nothing here repeats a
 * signature. What a method adds is the name a caller means, and whether running
 * it twice is the same as running it once.
 */
export class HostRelayClient
  extends DurableObjectClient<HostRelayAgent>
  implements IHostRelayClient
{
  async connect(input: AgentConnection): Promise<Response> {
    const request = createRelayUpgradeRequest(input)
    const response = await this.once(input.hostId, (relay) => relay.fetch(request))
    return completeRelayUpgrade(input, response, HOST_CONTROL_SUBPROTOCOL, 'control')
  }

  async readConversations(
    hostId: HostId,
    query: ListConversationsParams,
  ): Promise<ListConversationsResult> {
    const read = await this.repeatable(hostId, (relay) => relay.readConversations(query))
    const conversations = [...read.conversations]
    // The stub hands back a disposable proxy, so the result is copied out.
    return read.next === undefined ? { conversations } : { conversations, next: read.next }
  }

  async readStatus(hostId: HostId): Promise<HostStatus> {
    // The stub hands back a disposable proxy, so the answer is copied out.
    const read = await this.repeatable(hostId, (relay) => relay.readStatus())
    return { status: read.status }
  }

  disconnect(hostId: HostId): Promise<void> {
    return this.repeatable(hostId, (relay) => relay.disconnectAll())
  }
}
