import {
  ClientMessageSchema,
  createConnectionId,
  type ConnectionId,
  type ConversationId,
  type HostId,
} from '@porte/core'
import type { z } from 'zod'

import {
  SocketAttachmentSchema,
  type ClientAttachment,
  type SocketAttachment,
} from './socket-attachment.ts'

/** Anything the relay may push to a browser. A request only travels the other way. */
export type ClientMessage = Exclude<z.infer<typeof ClientMessageSchema>, { type: 'request' }>

/**
 * Who is connected to one Mac's relay, and how to reach them.
 *
 * The roster is the sockets themselves: Cloudflare hands them back after
 * hibernation, tagged, with their attachment intact. Nothing here is
 * remembered in memory, so nothing here is lost when the relay sleeps.
 *
 * One daemon, many clients. That asymmetry is the whole shape of the thing.
 */
export class RelaySockets {
  constructor(private readonly ctx: DurableObjectState) {}

  /**
   * Take a Mac's socket, replacing any earlier one.
   *
   * A second daemon means the first is gone or stale, and two would leave
   * frames going to whichever answered first.
   */
  acceptDaemon(socket: WebSocket, hostId: HostId): void {
    for (const current of this.ctx.getWebSockets('daemon')) {
      current.close(1012, 'daemon replaced')
    }

    this.ctx.acceptWebSocket(socket, ['daemon'])
    socket.serializeAttachment({ role: 'daemon', hostId } satisfies SocketAttachment)
  }

  /** Take a browser's socket. Its id is what a reply is addressed back to. */
  acceptClient(socket: WebSocket): ClientAttachment {
    const attachment = {
      role: 'client',
      connectionId: createConnectionId(),
      conversation: { state: 'closed' },
    } satisfies ClientAttachment

    this.ctx.acceptWebSocket(socket, ['client'])
    socket.serializeAttachment(attachment)
    return attachment
  }

  /** What this socket is, or nothing when its attachment does not parse. */
  attachmentOf(socket: WebSocket): SocketAttachment | undefined {
    const parsed = SocketAttachmentSchema.safeParse(socket.deserializeAttachment())
    return parsed.success ? parsed.data : undefined
  }

  /** The live Mac, if one is here. Its absence is what "offline" means. */
  daemon(): WebSocket | undefined {
    return this.ctx.getWebSockets('daemon').find((socket) => socket.readyState === WebSocket.OPEN)
  }

  /** Whether a Mac remains after this one closed, so a replacement reads as online. */
  hasOtherDaemon(closed: WebSocket): boolean {
    return this.ctx
      .getWebSockets('daemon')
      .some((socket) => socket !== closed && socket.readyState === WebSocket.OPEN)
  }

  /** The browser that asked, so a reply reaches the one waiting for it. */
  client(connectionId: ConnectionId): WebSocket | undefined {
    return this.ctx
      .getWebSockets('client')
      .find((socket) => this.clientAttachmentOf(socket)?.connectionId === connectionId)
  }

  /** Every browser watching one conversation. A turn is shown on all of them. */
  conversationClients(conversationId: ConversationId): WebSocket[] {
    return this.ctx.getWebSockets('client').filter((socket) => {
      const attachment = this.clientAttachmentOf(socket)
      return (
        attachment?.conversation.state === 'open' &&
        attachment.conversation.conversationId === conversationId
      )
    })
  }

  /** Remember which conversation a browser is watching, across hibernation. */
  watchConversation(socket: WebSocket, conversationId: ConversationId | null): void {
    const attachment = this.clientAttachmentOf(socket)
    if (attachment === undefined) return

    socket.serializeAttachment({
      ...attachment,
      conversation:
        conversationId === null ? { state: 'closed' } : { state: 'open', conversationId },
    } satisfies SocketAttachment)
  }

  /** Tell every browser. Used for facts about the Mac rather than a conversation. */
  broadcast(message: ClientMessage): void {
    for (const client of this.ctx.getWebSockets('client')) this.send(client, message)
  }

  /** Send one message, and never to a socket that is already gone. */
  send(socket: WebSocket, message: ClientMessage): void {
    if (socket.readyState !== WebSocket.OPEN) return
    socket.send(JSON.stringify(ClientMessageSchema.parse(message)))
  }

  /** Turn everyone out. The relay keeps nothing worth reconnecting to. */
  closeAll(reason: string): void {
    for (const socket of this.ctx.getWebSockets()) socket.close(1000, reason)
  }

  private clientAttachmentOf(socket: WebSocket): ClientAttachment | undefined {
    const attachment = this.attachmentOf(socket)
    return attachment?.role === 'client' ? attachment : undefined
  }
}
