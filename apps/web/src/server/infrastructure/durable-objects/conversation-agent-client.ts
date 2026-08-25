import { DurableObjectClient, HOST_CONVERSATION_SUBPROTOCOL } from '@porte/core'
import type {
  ConnectConversationAgent,
  IConversationAgentClient,
} from '@web/server/application/ports/conversation-agent-client.ts'
import { routeSubAgentRequest } from 'agents'

import type { HostRelayAgent } from './host-relay-agent.ts'
import { createRelayUpgradeRequest } from './relay/relay-upgrade-request.ts'
import { completeRelayUpgrade } from './relay/relay-upgrade-response.ts'

/** Routes Worker requests to conversation facets through their resolved parent. */
export class ConversationAgentClient
  extends DurableObjectClient<HostRelayAgent>
  implements IConversationAgentClient
{
  async connect(input: ConnectConversationAgent): Promise<Response> {
    const request = createRelayUpgradeRequest(input)
    const fromPath = `/sub/conversation-agent/${input.conversationId}`
    const response = await this.once(input.hostId, (parent) =>
      routeSubAgentRequest(request, parent, { fromPath }),
    )
    return completeRelayUpgrade(input, response, HOST_CONVERSATION_SUBPROTOCOL, 'conversation')
  }

  async readMessages(input: ConnectConversationAgent): Promise<Response> {
    const request = createRelayUpgradeRequest(input)
    // The leaf rides in `fromPath` because the forwarder replaces the pathname whole.
    const fromPath = `/sub/conversation-agent/${input.conversationId}/get-messages`
    return this.repeatable(input.hostId, (parent) =>
      routeSubAgentRequest(request, parent, { fromPath }),
    )
  }
}
