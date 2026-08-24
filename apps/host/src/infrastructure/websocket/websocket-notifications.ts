import type { ControlNotifications } from '@host/application/ports/control-notifications.ts'
import type { ConversationNotifications } from '@host/application/ports/conversation-notifications.ts'
import type { WebSocketClient } from '@host/infrastructure/websocket/party-socket-client.ts'
import { jsonRpcNotification, type JsonRpcDocument } from '@porte/core/client'

/** Send application notifications through the control connection. */
export class WebSocketControlNotifications implements ControlNotifications {
  constructor(private readonly socket: WebSocketClient) {}

  /** Send changed conversation metadata. */
  conversationUpdated(
    conversation: Parameters<ControlNotifications['conversationUpdated']>[0],
  ): void {
    send(this.socket, jsonRpcNotification('conversation.updated', { conversation }))
  }

  /** Send the identifier of a removed conversation. */
  conversationRemoved(
    conversationId: Parameters<ControlNotifications['conversationRemoved']>[0],
  ): void {
    send(this.socket, jsonRpcNotification('conversation.removed', { conversationId }))
  }
}

/** Send application notifications through one conversation connection. */
export class WebSocketConversationNotifications implements ConversationNotifications {
  constructor(private readonly socket: WebSocketClient) {}

  /** Send the current conversation state. */
  sendState(state: Parameters<ConversationNotifications['sendState']>[0]): void {
    send(this.socket, jsonRpcNotification('conversation.state', { state }))
  }

  /** Send one canonical conversation event. */
  sendEvent(event: Parameters<ConversationNotifications['sendEvent']>[0]): void {
    send(this.socket, jsonRpcNotification('conversation.event', { event }))
  }
}

function send(socket: WebSocketClient, document: JsonRpcDocument): void {
  if (!socket.send(JSON.stringify(document))) socket.reconnect(1011, 'notification send failed')
}
