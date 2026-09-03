import type { EventHandler } from '@host/application/handlers/types.ts'
import type { EventMap } from '@host/domain/messages/types.ts'

/** Effect: a turn that started answers the `turn.start` request waiting on its attempt. */
export const bindAttempt: EventHandler<EventMap['ConversationEventRaised']> = async (
  raised,
  deps,
) => {
  const event = raised.event
  if (event.type !== 'turn.started') return
  deps.attempts.bound(event.attemptId, event.turnId)
}
