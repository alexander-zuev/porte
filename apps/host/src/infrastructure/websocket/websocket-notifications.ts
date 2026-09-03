import type { ControlNotifications } from '@host/application/ports/control-notifications.ts'
import type { ConversationNotifications } from '@host/application/ports/conversation-notifications.ts'
import { SequenceNumberSchema, jsonRpcNotification, type SequenceNumber } from '@porte/core/client'

type SendFrame = (frame: string) => void | Promise<void>

/** Numbers every notification on one socket, from 1; the relay applies them in this order. */
export type NotificationSequence = {
  readonly next: () => SequenceNumber
  /** A reconnect is a new socket to the relay, which expects 1 again. */
  readonly restart: () => void
}

/** Create one sequence. Restart it on every socket open, not once per connection. */
export function createNotificationSequence(): NotificationSequence {
  let last = 0
  return {
    next: () => {
      last += 1
      return SequenceNumberSchema.parse(last)
    },
    restart: () => {
      last = 0
    },
  }
}

/** Send application notifications through the control connection. */
export function createControlNotifications(
  send: SendFrame,
  { next }: NotificationSequence,
): ControlNotifications {
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
export function createConversationNotifications(
  send: SendFrame,
  { next }: NotificationSequence,
): ConversationNotifications {
  return {
    sendEvent: (event) => {
      void send(JSON.stringify(jsonRpcNotification('conversation.event', { seq: next(), event })))
    },
  }
}
