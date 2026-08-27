import type { EventHandler } from '@host/application/handlers/types.ts'
import type { EventMap } from '@host/domain/messages/types.ts'
import type { ConversationEvent, ElicitationAnswer } from '@porte/core/client'

/** Effect: a resolved permission or elicitation answers the agent request parked for it. */
export const releaseParkedRequest: EventHandler<EventMap['ConversationEventRaised']> = async (
  raised,
  deps,
) => {
  const event = raised.event
  if (event.type === 'permission.resolved') {
    deps.codingAgent.resolvePermission(event.permissionId, event.outcome)
  } else if (event.type === 'elicitation.resolved') {
    deps.codingAgent.resolveElicitation(event.elicitationId, toAnswer(event.outcome))
  }
}

function toAnswer(
  outcome: Extract<ConversationEvent, { type: 'elicitation.resolved' }>['outcome'],
): ElicitationAnswer {
  switch (outcome.type) {
    case 'submitted':
      return { type: 'submit', values: outcome.values }
    case 'accepted':
      return { type: 'accept' }
    case 'declined':
      return { type: 'decline' }
    case 'cancelled':
      return { type: 'cancel' }
  }
}
