import type { ControlNotifications } from '@host/application/ports/control-notifications.ts'
import type { ConversationNotifications } from '@host/application/ports/conversation-notifications.ts'
import { SequenceNumberSchema, jsonRpcNotification, type SequenceNumber } from '@porte/core/client'

type SendFrame = (frame: string) => void | Promise<void>

/** Numbers every notification on one connection, from 1; the relay applies them in this order. */
function sequence(): () => SequenceNumber {
  let last = 0
  return () => {
    last += 1
    return SequenceNumberSchema.parse(last)
  }
}

/** Send application notifications through the control connection. */
export function createControlNotifications(send: SendFrame): ControlNotifications {
  const next = sequence()
  return {
    conversationUpdated: (conversationId, update) => {
      void send(
        JSON.stringify(
          jsonRpcNotification('conversation.updated', { seq: next(), conversationId, update }),
        ),
      )
    },
  }
}

/** Send application notifications through one conversation connection. */
export function createConversationNotifications(send: SendFrame): ConversationNotifications {
  const next = sequence()
  return {
    sendEvent: (event) => {
      void send(JSON.stringify(jsonRpcNotification('conversation.event', { seq: next(), event })))
    },
  }
}
