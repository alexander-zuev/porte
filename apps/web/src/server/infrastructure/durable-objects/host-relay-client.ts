import type { ConversationPage, ConversationPageQuery, HostId, HostStatus } from '@porte/core'
import { DurableObjectClient } from '@porte/core'
import type { ConnectHost, HostRelay } from '@server/application/ports/host-relay.ts'

import type { HostRelayDO } from './host-relay-do.ts'
import { RELAY_HOST_ID_HEADER, RELAY_ROLE_HEADER } from './relay/relay-headers.ts'

/**
 * How the Worker reaches one Mac's relay.
 *
 * The relay's own types come through each call, so nothing here repeats a
 * signature. What a method adds is the name a caller means, and whether running
 * it twice is the same as running it once.
 */
export class HostRelayClient extends DurableObjectClient<HostRelayDO> implements HostRelay {
  connect(input: ConnectHost): Promise<Response> {
    const request = upgradeRequest(input)
    return this.once(input.hostId, (relay) => relay.fetch(request))
  }

  async readConversations(hostId: HostId, query: ConversationPageQuery): Promise<ConversationPage> {
    const page = await this.repeatable(hostId, (relay) => relay.readConversations(query))
    // The stub hands back a disposable proxy; the page has to outlive it.
    return { conversations: page.conversations, next: page.next }
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
