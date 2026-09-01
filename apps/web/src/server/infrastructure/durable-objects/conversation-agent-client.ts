import { DurableObjectClient, HOST_CONVERSATION_SUBPROTOCOL } from '@porte/core'
import type {
  ConnectConversationAgent,
  IConversationAgentClient,
  ReadConversationMessages,
} from '@web/server/application/ports/conversation-agent-client.ts'
import { getSubAgentByName, routeSubAgentRequest } from 'agents'
import type { UIMessage } from 'ai'

import { ConversationAgent } from './conversation-agent.ts'
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

  async readMessages(input: ReadConversationMessages): Promise<UIMessage[]> {
    return this.repeatable(input.hostId, async (parent) => {
      const agent = await getSubAgentByName(parent, ConversationAgent, input.conversationId)
      return agent.readMessages()
    })
  }
}
