import type {
  PorteErrorPayload,
  ConversationPage,
  ConversationPageQuery,
  ConversationTranscript,
  HostId,
  HostStatus,
  ReadConversation,
  RpcResponse,
} from '@porte/core'
import { DurableObjectClient, rpcErr, rpcOk } from '@porte/core'
import type { ConnectHost, HostRelay } from '@server/application/ports/host-relay.ts'
import { routeSubAgentRequest } from 'agents'

import type { HostRelayAgent } from './host-relay-agent.ts'
import { RELAY_HOST_ID_HEADER, RELAY_ROLE_HEADER } from './relay/relay-headers.ts'

/**
 * How the Worker reaches one Mac's relay.
 *
 * The relay's own types come through each call, so nothing here repeats a
 * signature. What a method adds is the name a caller means, and whether running
 * it twice is the same as running it once.
 */
export class HostRelayClient extends DurableObjectClient<HostRelayAgent> implements HostRelay {
  connect(input: ConnectHost): Promise<Response> {
    const request = upgradeRequest(input)
    return this.once(input.hostId, (relay) => {
      if (input.target.type === 'host') return relay.fetch(request)
      return routeSubAgentRequest(request, relay, {
        fromPath: new URL(request.url).pathname,
      })
    })
  }

  async readConversations(hostId: HostId, query: ConversationPageQuery): Promise<ConversationPage> {
    const page = await this.repeatable(hostId, (relay) => relay.readConversations(query))
    // The stub hands back a disposable proxy; the page has to outlive it.
    return { conversations: page.conversations, next: page.next }
  }

  async readConversation(
    hostId: HostId,
    query: ReadConversation,
  ): Promise<RpcResponse<ConversationTranscript, PorteErrorPayload>> {
    const response = await this.once<RpcResponse<ConversationTranscript, PorteErrorPayload>>(
      hostId,
      (relay) => relay.readConversation(query),
    )
    // The stub hands back a disposable proxy; the answer has to outlive it.
    if (!response.success) return rpcErr(response.error)
    return rpcOk({ ...response.data, events: [...response.data.events] })
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

/**
 * The upgrade, addressed to the relay that serves this Mac.
 *
 * The bearer token is spent by the time this runs: the relay has no use for it
 * and no way to check it, so it does not travel further.
 */
function upgradeRequest(input: ConnectHost): Request {
  const headers = new Headers(input.request.headers)
  headers.delete('authorization')
  headers.set(RELAY_ROLE_HEADER, input.role)
  headers.set(RELAY_HOST_ID_HEADER, input.hostId)
  return new Request(input.request, { headers })
}
