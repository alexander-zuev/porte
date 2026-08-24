import type { SubAgentStub } from 'agents'

import { ConversationEventProjector } from '@web/lib/conversation/conversation-event-projector.ts'
import type { HostRelayAgent } from './host-relay-agent.ts'

/** Resources owned by one conversation child Agent. */
export type ConversationAgentResources = {
  eventProjector: ConversationEventProjector
  hostRelay: () => Promise<SubAgentStub<HostRelayAgent>>
}

/** Construct conversation resources from the parent Agent resolver. */
export function createConversationAgentResources(
  hostRelay: () => Promise<SubAgentStub<HostRelayAgent>>,
): ConversationAgentResources {
  return {
    eventProjector: new ConversationEventProjector(),
    hostRelay,
  }
}
