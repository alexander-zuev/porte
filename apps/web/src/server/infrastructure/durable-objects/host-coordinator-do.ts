import {
  ClientEventSchemas,
  ClientMethodSchemas,
  DaemonMessageSchema,
  HostIdSchema,
  RequestIdSchema,
  RequestMessageSchema,
  RoutedEventSchema,
  RoutedResponseSchema,
  createLogger,
  sendableCloseCode,
  type DaemonMessage,
  type RoutedRequest,
} from '@porte/core'
import { DurableObject } from 'cloudflare:workers'
import { z } from 'zod'

import { recordHostSeen } from '../../application/commands/record-host-seen.command.ts'
import { createAppDeps, type AppDeps } from '../app-deps.ts'
import type { RuntimeEnv } from '../runtime-env.ts'
import { RelayCatalog } from './relay/relay-catalog.ts'
import { readFrame, type JsonValue } from './relay/relay-frame.ts'
import { RELAY_HOST_ID_HEADER, RELAY_ROLE_HEADER } from './relay/relay-headers.ts'
import { RelaySockets, type ClientMessage } from './relay/relay-sockets.ts'
import type { ClientAttachment } from './relay/socket-attachment.ts'

const roleSchema = z.enum(['daemon', 'client'])
const requestIdentitySchema = z.object({ requestId: RequestIdSchema })
const logger = createLogger('host-coordinator')

/**
 * The switchboard for one Mac.
 *
 * It joins two parties who cannot reach each other: the Mac dials out and so
 * does the browser, and both land here. One daemon, many clients, frames
 * travelling in opposite directions between them.
 *
 * It never opens a frame it is only carrying. Turns, tool calls, and prompts
 * pass through as they arrived. The only thing it reads is the address.
 *
 * It hibernates, so nothing lives in a field. State is on the sockets, or in
 * storage; `RelaySockets` and `RelayCatalog` own that distinction.
 */
export class HostCoordinatorDO extends DurableObject<RuntimeEnv> {
  private readonly sockets: RelaySockets
  private readonly catalog: RelayCatalog
  private readonly deps: AppDeps

  constructor(ctx: DurableObjectState, env: RuntimeEnv) {
    super(ctx, env)

    this.sockets = new RelaySockets(ctx)
    this.catalog = new RelayCatalog(ctx.storage)
    // The same dependencies every other entrypoint gets. A relay that assembled
    // its own would be a second place the wiring lives.
    this.deps = createAppDeps(env, ctx)
  }

  async fetch(request: Request): Promise<Response> {
    const role = roleSchema.safeParse(request.headers.get(RELAY_ROLE_HEADER))
    const hostId = HostIdSchema.safeParse(request.headers.get(RELAY_HOST_ID_HEADER))
    if (!role.success || !hostId.success) return new Response('Forbidden', { status: 403 })

    const pair = new WebSocketPair()
    const [client, server] = [pair[0], pair[1]]

    if (role.data === 'daemon') {
      this.sockets.acceptDaemon(server, hostId.data)
      this.sockets.broadcast(hostStatus('online'))
      // The arrival is an observation worth keeping after the Mac goes away.
      this.ctx.waitUntil(this.rememberSeen(hostId.data))
    } else {
      this.sockets.acceptClient(server)
    }

    return new Response(null, { status: 101, webSocket: client })
  }

  /**
   * End every connection this relay holds.
   *
   * Called when the pairing ends. Clients are told the Mac is gone before the
   * sockets close, so a page that is open explains itself rather than going
   * quiet. Nothing here can be reconnected to: the next attempt is refused
   * before it reaches the relay at all.
   */
  disconnectAll(): void {
    this.sockets.broadcast(hostStatus('offline'))
    this.sockets.closeAll('pairing ended')
  }

  async webSocketMessage(socket: WebSocket, frame: string | ArrayBuffer): Promise<void> {
    try {
      const attachment = this.sockets.attachmentOf(socket)
      if (attachment === undefined) {
        socket.close(1011, 'invalid socket state')
        return
      }

      const read = readFrame(frame)
      if (!read.ok) {
        socket.close(read.reason === 'not-text' ? 1003 : 1007, `frame was ${read.reason}`)
        return
      }

      if (attachment.role === 'client') {
        await this.handleClientMessage(socket, attachment, read.json)
        return
      }

      // The Mac speaks a different vocabulary, and only its own is legal here.
      const message = DaemonMessageSchema.safeParse(read.json)
      if (!message.success) {
        logger.error('daemon_message_invalid', { details: { issues: message.error.message } })
        socket.close(1007, 'invalid daemon message')
        return
      }

      await this.handleDaemonMessage(message.data)
    } catch (error) {
      logger.error('host_message_failed', { error })
      socket.close(1011, 'host message failed')
    }
  }

  webSocketClose(socket: WebSocket, code: number, reason: string): void {
    const attachment = this.sockets.attachmentOf(socket)
    const daemonLeft = attachment?.role === 'daemon' && !this.sockets.hasOtherDaemon(socket)

    if (daemonLeft) {
      this.sockets.broadcast(hostStatus('offline'))
      // The departure is the second and last moment anyone saw this Mac.
      this.ctx.waitUntil(this.rememberSeen(attachment.hostId))
    }

    socket.close(sendableCloseCode(code), reason)
  }

  webSocketError(socket: WebSocket, cause: unknown): void {
    logger.error('host_socket_failed', { error: cause })
    socket.close(1011, 'host socket failed')
  }

  /** A browser asks; the relay answers itself, or passes the question along. */
  private async handleClientMessage(
    socket: WebSocket,
    attachment: ClientAttachment,
    value: JsonValue,
  ): Promise<void> {
    const request = RequestMessageSchema.safeParse(value)
    if (!request.success) {
      this.rejectInvalidRequest(socket, value)
      return
    }

    // The only question the relay can answer on its own: it holds the socket
    // and it holds the catalog, so both halves are already here.
    if (request.data.method === 'host.snapshot') {
      // The catalog is read first, and the status only once nothing else can
      // run. Reading the status before that await let a daemon arrive during
      // it: the client took the online event, then this answer saying offline,
      // and settled on the wrong one.
      const catalog = await this.catalog.read()

      this.sockets.send(socket, {
        v: 1,
        type: 'result',
        requestId: request.data.requestId,
        result: {
          status: this.sockets.daemon() === undefined ? 'offline' : 'online',
          catalog,
        },
      })
      return
    }

    const daemon = this.sockets.daemon()
    if (daemon === undefined) {
      this.sockets.send(socket, {
        v: 1,
        type: 'error',
        requestId: request.data.requestId,
        error: { code: 'HOST_OFFLINE', message: 'Host is offline' },
      })
      return
    }

    // Tagged with who asked, so the answer can find its way back.
    const routed: RoutedRequest = {
      route: { connectionId: attachment.connectionId },
      message: request.data,
    }
    daemon.send(JSON.stringify(routed))
  }

  /** The Mac answers or reports; the relay decides who hears it. */
  private async handleDaemonMessage(message: DaemonMessage): Promise<void> {
    const response = RoutedResponseSchema.safeParse(message)
    if (response.success) {
      this.routeResponse(response.data)
      return
    }

    const event = RoutedEventSchema.parse(message)
    if (event.audience.type === 'host') {
      if (event.message.event === 'conversations.changed') {
        const changed = ClientEventSchemas['conversations.changed'].parse(event.message.data)
        await this.catalog.write(changed.catalog)
      }
      this.sockets.broadcast(event.message)
      return
    }

    if (event.audience.type === 'connection') {
      const target = this.sockets.client(event.audience.connectionId)
      if (target !== undefined) this.sockets.send(target, event.message)
      return
    }

    for (const client of this.sockets.conversationClients(event.audience.conversationId)) {
      this.sockets.send(client, event.message)
    }
  }

  /**
   * Return one answer to the browser that asked.
   *
   * Opening and closing a conversation are the two answers the relay reads,
   * because they change which events that browser should receive next.
   */
  private routeResponse(response: z.infer<typeof RoutedResponseSchema>): void {
    const target = this.sockets.client(response.route.connectionId)
    if (target === undefined) return

    if (response.message.type === 'result') {
      if (response.method === 'conversation.open') {
        const opened = ClientMethodSchemas['conversation.open'].result.parse(
          response.message.result,
        )
        this.sockets.watchConversation(target, opened.conversation.id)
      }
      if (response.method === 'conversation.close') {
        this.sockets.watchConversation(target, null)
      }
    }

    this.sockets.send(target, response.message)
  }

  private rejectInvalidRequest(socket: WebSocket, value: JsonValue): void {
    const identity = requestIdentitySchema.safeParse(value)
    if (!identity.success) {
      socket.close(1007, 'invalid client request')
      return
    }

    this.sockets.send(socket, {
      v: 1,
      type: 'error',
      requestId: identity.data.requestId,
      error: { code: 'INVALID_REQUEST', message: 'Invalid request' },
    })
  }

  /** The one durable fact this relay produces. Nothing else here reaches D1. */
  private async rememberSeen(hostId: z.infer<typeof HostIdSchema>): Promise<void> {
    await recordHostSeen(this.deps.hosts, hostId, new Date())
  }
}

/** Built, not parsed: the type is the contract on the way out. */
function hostStatus(status: 'online' | 'offline'): ClientMessage {
  return { v: 1, type: 'event', event: 'host.status', data: { status } }
}
