import type { EventHandler } from '@host/application/handlers/types.ts'
import { IDLE_EVICTION_MS } from '@host/application/turn-policy.ts'
import { createCommand, type EventMap } from '@host/domain/messages/types.ts'
import { IsoDateTimeSchema } from '@porte/core/client'

/**
 * Effect: a turn boundary is activity, and the end of a turn starts the idle
 * clock. One place for every way a turn ends: Grok's stream, or the cancel
 * deadline.
 */
export const trackTurnActivity: EventHandler<EventMap['ConversationEventRaised']> = async (
  raised,
  deps,
) => {
  const event = raised.event
  if (event.type !== 'turn.started' && event.type !== 'turn.finished') return
  const conversation = deps.conversations.find(raised.conversationId)
  if (conversation === null) return
  conversation.touch(IsoDateTimeSchema.parse(deps.now().toISOString()))
  deps.conversations.save(conversation)

  if (event.type !== 'turn.finished') return
  const { conversationId } = raised
  deps.scheduler.schedule(IDLE_EVICTION_MS, () => {
    deps.background.run(deps.bus.handle(createCommand('CloseIdleConversation', { conversationId })))
  })
}
