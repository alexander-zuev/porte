import type { ControlNotifications } from '@host/application/ports/control-notifications.ts'
import type { ConversationNotifications } from '@host/application/ports/conversation-notifications.ts'
import { jsonRpcNotification } from '@porte/core/client'

type SendFrame = (frame: string) => void | Promise<void>

/** Send application notifications through the control connection. */
export function createControlNotifications(send: SendFrame): ControlNotifications {
  return {
    conversationUpdated: (conversation) => {
      void send(JSON.stringify(jsonRpcNotification('conversation.updated', { conversation })))
    },
  }
}

/** Send application notifications through one conversation connection. */
export function createConversationNotifications(send: SendFrame): ConversationNotifications {
  return {
    sendState: (state) => {
      void send(JSON.stringify(jsonRpcNotification('conversation.state', { state })))
    },
    sendEvent: (event) => {
      void send(JSON.stringify(jsonRpcNotification('conversation.event', { event })))
    },
  }
}
