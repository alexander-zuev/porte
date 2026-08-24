import type {
  ConversationEvent,
  ConversationStateSnapshot,
  EventSequence,
  TurnId,
} from '@porte/core'
import { DurableObjectClient } from '@porte/core'
import type { SubAgentStub } from 'agents'

import type { ConversationAgent } from './conversation-agent.ts'

/** Parent-side calls to one conversation child Agent. */
export class ConversationAgentClient extends DurableObjectClient<
  ConversationAgent,
  SubAgentStub<ConversationAgent>
> {
  initializeConversation(name: string, snapshot: ConversationStateSnapshot): Promise<void> {
    return this.repeatable(name, (agent) => agent.initializeConversation(snapshot))
  }

  acceptHostEvent(
    name: string,
    eventSequence: EventSequence,
    event: ConversationEvent,
  ): Promise<EventSequence> {
    return this.repeatable(name, (agent) => agent.acceptHostEvent(eventSequence, event))
  }

  acceptHostSnapshot(
    name: string,
    eventSequence: EventSequence,
    snapshot: ConversationStateSnapshot,
  ): Promise<EventSequence> {
    return this.repeatable(name, (agent) => agent.acceptHostSnapshot(eventSequence, snapshot))
  }

  reconcileHostTurn(name: string, turnId: TurnId | null): Promise<void> {
    return this.repeatable(name, (agent) => agent.reconcileHostTurn(turnId))
  }

  acceptedEventHead(name: string): Promise<EventSequence | undefined> {
    return this.repeatable(name, (agent) => agent.acceptedEventHead())
  }
}
