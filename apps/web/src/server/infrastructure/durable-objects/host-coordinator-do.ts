import {
  ClientEventSchemas,
  ClientMessageSchema,
  ClientMethodSchemas,
  ConnectionIdSchema,
  DaemonMessageSchema,
  ErrorMessageSchema,
  EventMessageSchema,
  RequestIdSchema,
  RequestMessageSchema,
  RoutedEventSchema,
  RoutedRequestSchema,
  RoutedResponseSchema,
  ConversationCatalogSchema,
  ConversationIdSchema,
  createConnectionId,
  createLogger,
  type ConversationCatalog,
} from '@porte/core'
import { DurableObject } from 'cloudflare:workers'
import { z } from 'zod'

import type { RuntimeEnv } from '../runtime-env.ts'

const CATALOG_KEY = 'session-catalog'
const roleSchema = z.enum(['daemon', 'client'])
const frameSchema = z.string()
const jsonValueSchema = z.json()
const requestIdentitySchema = z.object({ requestId: RequestIdSchema })
const logger = createLogger('host-coordinator')

const clientConversationSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('closed') }),
  z.object({ state: z.literal('open'), conversationId: ConversationIdSchema }),
])

const socketAttachmentSchema = z.discriminatedUnion('role', [
  z.object({ role: z.literal('daemon') }),
  z.object({
    role: z.literal('client'),
    connectionId: ConnectionIdSchema,
    conversation: clientConversationSchema,
  }),
])
type SocketAttachment = z.infer<typeof socketAttachmentSchema>
type ClientMessage = Exclude<z.infer<typeof ClientMessageSchema>, { type: 'request' }>
type JsonValue = z.infer<typeof jsonValueSchema>

/** One hibernating relay instance for one Porte host. */
export class HostCoordinatorDO extends DurableObject<RuntimeEnv> {
  async fetch(request: Request): Promise<Response> {
    const role = roleSchema.safeParse(request.headers.get('x-porte-host-role'))
    if (!role.success) return new Response('Forbidden', { status: 403 })

    const pair = new WebSocketPair()
    const client = pair[0]
    const server = pair[1]
    if (role.data === 'daemon') {
      for (const current of this.ctx.getWebSockets('daemon')) {
        current.close(1012, 'daemon replaced')
      }
      this.ctx.acceptWebSocket(server, ['daemon'])
      server.serializeAttachment({ role: 'daemon' } satisfies SocketAttachment)
      this.broadcastClients(hostStatusMessage('online'))
    } else {
      const attachment = {
        role: 'client',
        connectionId: createConnectionId(),
        conversation: { state: 'closed' },
      } satisfies SocketAttachment
      this.ctx.acceptWebSocket(server, ['client'])
      server.serializeAttachment(attachment)
    }

    return new Response(null, { status: 101, webSocket: client })
  }

  async webSocketMessage(socket: WebSocket, frame: string | ArrayBuffer): Promise<void> {
    try {
      const attachment = socketAttachmentSchema.safeParse(socket.deserializeAttachment())
      if (!attachment.success) {
        socket.close(1011, 'invalid socket state')
        return
      }
      const text = frameSchema.safeParse(frame)
      if (!text.success) {
        socket.close(1003, 'text messages required')
        return
      }
      if (attachment.data.role === 'client') {
        await this.handleClientMessage(socket, attachment.data, text.data)
        return
      }
      await this.handleDaemonMessage(text.data)
    } catch (error) {
      logger.error('host_message_failed', { error })
      socket.close(1011, 'host message failed')
    }
  }

  webSocketClose(socket: WebSocket, code: number, reason: string): void {
    const attachment = socketAttachmentSchema.safeParse(socket.deserializeAttachment())
    if (attachment.success && attachment.data.role === 'daemon' && !this.hasOtherDaemon(socket)) {
      this.broadcastClients(hostStatusMessage('offline'))
    }
    socket.close(safeCloseCode(code), reason)
  }

  webSocketError(socket: WebSocket, cause: unknown): void {
    logger.error('host_socket_failed', { error: cause })
    socket.close(1011, 'host socket failed')
  }

  private async handleClientMessage(
    socket: WebSocket,
    attachment: Extract<SocketAttachment, { role: 'client' }>,
    raw: string,
  ): Promise<void> {
    const value = parseJson(raw)
    const request = RequestMessageSchema.safeParse(value)
    if (!request.success) {
      this.rejectInvalidRequest(socket, value)
      return
    }
    if (request.data.method === 'host.snapshot') {
      const catalog = await this.readCatalog()
      const result = ClientMethodSchemas['host.snapshot'].result.parse({
        status: this.daemon() === undefined ? 'offline' : 'online',
        catalog,
      })
      this.sendClient(socket, {
        v: 1,
        type: 'result',
        requestId: request.data.requestId,
        result,
      })
      return
    }

    const daemon = this.daemon()
    if (daemon === undefined) {
      this.sendClient(socket, {
        v: 1,
        type: 'error',
        requestId: request.data.requestId,
        error: { code: 'HOST_OFFLINE', message: 'Host is offline' },
      })
      return
    }
    daemon.send(
      JSON.stringify(
        RoutedRequestSchema.parse({
          route: { connectionId: attachment.connectionId },
          message: request.data,
        }),
      ),
    )
  }

  private async handleDaemonMessage(raw: string): Promise<void> {
    const message = DaemonMessageSchema.parse(parseJson(raw))
    const response = RoutedResponseSchema.safeParse(message)
    if (response.success) {
      this.routeResponse(response.data)
      return
    }

    const event = RoutedEventSchema.parse(message)
    if (event.audience.type === 'host') {
      if (event.message.event === 'conversations.changed') {
        const changed = ClientEventSchemas['conversations.changed'].parse(event.message.data)
        await this.ctx.storage.put(CATALOG_KEY, changed.catalog)
      }
      this.broadcastClients(event.message)
      return
    }
    if (event.audience.type === 'connection') {
      const target = this.client(event.audience.connectionId)
      if (target !== undefined) this.sendClient(target, event.message)
      return
    }
    for (const client of this.conversationClients(event.audience.conversationId)) {
      this.sendClient(client, event.message)
    }
  }

  private routeResponse(response: z.infer<typeof RoutedResponseSchema>): void {
    const target = this.client(response.route.connectionId)
    if (target === undefined) return
    if (response.message.type === 'result') {
      const attachment = this.clientAttachment(target)
      if (attachment !== undefined && response.method === 'conversation.open') {
        const opened = ClientMethodSchemas['conversation.open'].result.parse(
          response.message.result,
        )
        target.serializeAttachment({
          ...attachment,
          conversation: { state: 'open', conversationId: opened.conversation.id },
        } satisfies SocketAttachment)
      }
      if (attachment !== undefined && response.method === 'conversation.close') {
        target.serializeAttachment({
          ...attachment,
          conversation: { state: 'closed' },
        } satisfies SocketAttachment)
      }
    }
    this.sendClient(target, response.message)
  }

  private rejectInvalidRequest(socket: WebSocket, value: JsonValue | undefined): void {
    const identity = requestIdentitySchema.safeParse(value)
    if (!identity.success) {
      socket.close(1007, 'invalid client request')
      return
    }
    this.sendClient(
      socket,
      ErrorMessageSchema.parse({
        v: 1,
        type: 'error',
        requestId: identity.data.requestId,
        error: { code: 'INVALID_REQUEST', message: 'Invalid request' },
      }),
    )
  }

  private async readCatalog(): Promise<ConversationCatalog> {
    const stored = await this.ctx.storage.get(CATALOG_KEY)
    if (stored === undefined) return { state: 'never-synced' }
    return ConversationCatalogSchema.parse(stored)
  }

  private daemon(): WebSocket | undefined {
    return this.ctx.getWebSockets('daemon').find((socket) => socket.readyState === WebSocket.OPEN)
  }

  private hasOtherDaemon(closed: WebSocket): boolean {
    return this.ctx
      .getWebSockets('daemon')
      .some((socket) => socket !== closed && socket.readyState === WebSocket.OPEN)
  }

  private client(connectionId: z.infer<typeof ConnectionIdSchema>): WebSocket | undefined {
    return this.ctx
      .getWebSockets('client')
      .find((socket) => this.clientAttachment(socket)?.connectionId === connectionId)
  }

  private conversationClients(conversationId: z.infer<typeof ConversationIdSchema>): WebSocket[] {
    return this.ctx.getWebSockets('client').filter((socket) => {
      const attachment = this.clientAttachment(socket)
      return (
        attachment?.conversation.state === 'open' &&
        attachment.conversation.conversationId === conversationId
      )
    })
  }

  private clientAttachment(
    socket: WebSocket,
  ): Extract<SocketAttachment, { role: 'client' }> | undefined {
    const attachment = socketAttachmentSchema.safeParse(socket.deserializeAttachment())
    return attachment.success && attachment.data.role === 'client' ? attachment.data : undefined
  }

  private broadcastClients(message: ClientMessage): void {
    for (const client of this.ctx.getWebSockets('client')) this.sendClient(client, message)
  }

  private sendClient(socket: WebSocket, message: ClientMessage): void {
    if (socket.readyState !== WebSocket.OPEN) return
    socket.send(JSON.stringify(ClientMessageSchema.parse(message)))
  }
}

function parseJson(raw: string): JsonValue | undefined {
  try {
    return jsonValueSchema.parse(JSON.parse(raw))
  } catch {
    return undefined
  }
}

function hostStatusMessage(status: 'online' | 'offline'): ClientMessage {
  return EventMessageSchema.parse({
    v: 1,
    type: 'event',
    event: 'host.status',
    data: ClientEventSchemas['host.status'].parse({ status }),
  })
}

function safeCloseCode(code: number): number {
  return code === 1005 || code === 1006 || code === 1015 ? 1000 : code
}
