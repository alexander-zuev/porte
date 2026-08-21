import {
  ClientMethodSchemas,
  DaemonMessageSchema,
  HostIdSchema,
  RelayMessageSchema,
  RequestIdSchema,
  RequestMessageSchema,
  RoutedEventSchema,
  RoutedResponseSchema,
  ConnectionIdSchema,
  createLogger,
  createRequestId,
  sendableCloseCode,
  type ConversationPage,
  type ConversationPageQuery,
  type DaemonMessage,
  type RelayMessage,
  type RoutedRequest,
} from '@porte/core'
import * as Sentry from '@sentry/cloudflare'
import { recordHostSeen } from '@server/application/commands/record-host-seen.command.ts'
import { createAppDeps, type AppDeps } from '@server/infrastructure/app-deps.ts'
import { createSentryOptions } from '@server/infrastructure/observability/sentry-options.ts'
import { DurableObjectConversations } from '@server/infrastructure/persistence/repositories/conversations.repository.ts'
import type { RuntimeEnv } from '@server/infrastructure/runtime-env.ts'
import { DurableObject } from 'cloudflare:workers'
import { z } from 'zod'

import { readFrame, type JsonValue } from './relay/relay-frame.ts'
import { RELAY_HOST_ID_HEADER, RELAY_ROLE_HEADER } from './relay/relay-headers.ts'
import { RelaySockets, type ClientMessage } from './relay/relay-sockets.ts'
import type { ClientAttachment } from './relay/socket-attachment.ts'

const roleSchema = z.enum(['daemon', 'client'])
const requestIdentitySchema = z.object({ requestId: RequestIdSchema })
const logger = createLogger('host-relay')

/** How long a stored list outlives the Mac that reported it. */
const CONVERSATIONS_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000

/** Who the relay is when it asks the Mac for something no browser asked for. */
const RELAY_CONNECTION_ID = ConnectionIdSchema.parse('00000000-0000-7000-8000-000000000000')

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
 * storage; `RelaySockets` and `DurableObjectConversations` own that
 * distinction. Nothing is rehydrated at construction, so no call has to wait
 * on storage to find out what this relay is.
 */
class HostRelayDOBase extends DurableObject<RuntimeEnv> {
  private readonly sockets: RelaySockets
  private readonly conversations: DurableObjectConversations
  private readonly deps: AppDeps

  constructor(ctx: DurableObjectState, env: RuntimeEnv) {
    super(ctx, env)

    this.sockets = new RelaySockets(ctx)
    this.conversations = new DurableObjectConversations(ctx.storage)
    // Schema setup, the one thing this belongs on: no request may see a relay
    // whose table does not exist yet. Nothing is rehydrated into a field.
    // Not awaited on purpose: the gate holds every request until it settles, and
    // a failure resets the object rather than serving one without a table.
    void ctx.blockConcurrencyWhile(async () => {
      this.conversations.ensureSchema()
    })
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
      // Told, not asked. A browser arriving while the Mac is already here would
      // otherwise wait for a departure to learn the Mac was ever there.
      this.sockets.send(server, hostStatus(this.macStatus()))
    }

    return new Response(null, { status: 101, webSocket: client })
  }

  /** By RPC, because the page asks over HTTP, and keeps asking as it scrolls. */
  readConversations(query: ConversationPageQuery): ConversationPage {
    return this.conversations.page(query)
  }

  /**
   * End every connection this relay holds.
   *
   * Called when the pairing ends. Clients are told the Mac is gone before the
   * sockets close, so a page that is open explains itself rather than going
   * quiet. Nothing here can be reconnected to: the next attempt is refused
   * before it reaches the relay at all.
   *
   * Storage goes with them, all of it. Re-pairing mints a new host id, so this
   * relay is never addressed again; anything left is billed and unread forever.
   * `deleteAll` clears the pending expiry alarm too, from compatibility date
   * 2026-02-24 onwards.
   */
  async disconnectAll(): Promise<void> {
    this.sockets.broadcast(hostStatus('offline'))
    this.sockets.closeAll('pairing ended')
    await this.ctx.storage.deleteAll()
  }

  /**
   * The stored list has outlived the Mac that reported it.
   *
   * Unpair empties this relay, but an abandoned account never unpairs: no
   * request arrives to clean up after it, which is the one thing an alarm can
   * do that a request path cannot. A daemon that is still here has simply had
   * nothing to report, so its list waits another week instead.
   */
  async alarm(): Promise<void> {
    if (this.sockets.daemon() !== undefined) {
      await this.armConversationsExpiry()
      return
    }

    await this.conversations.forget()
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
        this.handleClientMessage(socket, attachment, read.json)
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

    if (attachment?.role === 'client') this.releaseConversation(socket)

    socket.close(sendableCloseCode(code), reason)
  }

  /**
   * Let the Mac stop an agent nobody is watching.
   *
   * An open conversation is a live agent process with its servers, and a browser
   * that closed its tab says nothing about it. The last watcher leaving is the
   * only moment the relay can tell.
   */
  private releaseConversation(leaving: WebSocket): void {
    const conversationId = this.sockets.watchedBy(leaving)
    if (conversationId === null) return

    this.sockets.watchConversation(leaving, null)
    if (this.sockets.conversationClients(conversationId, leaving).length > 0) return

    this.askMac('conversation.close', { conversationId })
  }

  /** Ask the Mac for something the relay decided on, with no browser waiting. */
  private askMac<Method extends 'conversation.close'>(
    method: Method,
    params: z.infer<(typeof ClientMethodSchemas)[Method]['params']>,
  ): void {
    const daemon = this.sockets.daemon()
    if (daemon === undefined) return

    const routed: RoutedRequest = {
      route: { connectionId: RELAY_CONNECTION_ID },
      message: { v: 1, type: 'request', requestId: createRequestId(), method, params },
    }
    daemon.send(JSON.stringify(routed))
  }

  webSocketError(socket: WebSocket, cause: unknown): void {
    logger.error('host_socket_failed', { error: cause })
    socket.close(1011, 'host socket failed')
  }

  /** A browser asks, and every question it can ask is for the Mac. */
  private handleClientMessage(
    socket: WebSocket,
    attachment: ClientAttachment,
    value: JsonValue,
  ): void {
    const request = RequestMessageSchema.safeParse(value)
    if (!request.success) {
      this.rejectInvalidRequest(socket, value)
      return
    }

    const daemon = this.sockets.daemon()
    if (daemon === undefined) {
      this.sockets.send(socket, {
        v: 1,
        type: 'error',
        requestId: request.data.requestId,
        error: { _tag: 'HostOfflineError', message: 'Host is offline' },
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

  /** The Mac answers, reports, or tells the relay itself; each goes a different way. */
  private async handleDaemonMessage(message: DaemonMessage): Promise<void> {
    const response = RoutedResponseSchema.safeParse(message)
    if (response.success) {
      this.routeResponse(response.data)
      return
    }

    const relayed = RelayMessageSchema.safeParse(message)
    if (relayed.success) {
      await this.handleRelayMessage(relayed.data)
      return
    }

    const event = RoutedEventSchema.parse(message)
    if (event.audience.type === 'host') {
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
    if (target === undefined) {
      this.releaseUnwatched(response)
      return
    }

    if (response.message.type === 'result') {
      if (response.method === 'conversation.open') {
        const opened = ClientMethodSchemas['conversation.open'].result.parse(
          response.message.result,
        )
        this.sockets.watchConversation(target, opened.conversation.id)
      }
      // Creating leaves it open on the Mac, so the browser watches it from here
      // rather than opening what it just made.
      if (response.method === 'conversation.create') {
        const created = ClientMethodSchemas['conversation.create'].result.parse(
          response.message.result,
        )
        this.sockets.watchConversation(target, created.conversation.id)
      }
      if (response.method === 'conversation.close') {
        this.sockets.watchConversation(target, null)
      }
    }

    this.sockets.send(target, response.message)
  }

  /**
   * A conversation was opened for a browser that has already gone.
   *
   * Without this the Mac holds an agent whose events reach nobody, because the
   * watch that would have delivered them was never registered.
   */
  private releaseUnwatched(response: z.infer<typeof RoutedResponseSchema>): void {
    if (response.message.type !== 'result') return
    if (response.method !== 'conversation.open' && response.method !== 'conversation.create') return

    const opened = ClientMethodSchemas[response.method].result.safeParse(response.message.result)
    if (!opened.success) return

    logger.warn('conversation_opened_for_departed_client', {
      details: { conversationId: opened.data.conversation.id },
    })
    this.askMac('conversation.close', { conversationId: opened.data.conversation.id })
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
      error: { _tag: 'ValidationError', message: 'Invalid request', issues: [] },
    })
  }

  /** Whether the Mac is holding a socket right now. The only liveness we can see. */
  private macStatus(): 'online' | 'offline' {
    return this.sockets.daemon() === undefined ? 'offline' : 'online'
  }

  /**
   * Write down what the Mac told the relay, then say what a browser should do.
   *
   * The list itself never goes over the socket. Clients are told it moved and
   * read the page they are actually showing, so one Mac with a long history
   * does not push all of it into every open tab.
   */
  private async handleRelayMessage(message: RelayMessage): Promise<void> {
    if (message.relay === 'conversations.sync') {
      this.conversations.writeChunk(message.epoch, message.conversations)
      if (!message.done) return

      await this.conversations.finishSync(message.epoch)
      await this.armConversationsExpiry()
      this.sockets.broadcast({ v: 1, type: 'event', event: 'conversations.invalidated', data: {} })
      return
    }

    if (message.relay === 'conversation.summary') {
      await this.conversations.upsert(message.conversation)
      await this.armConversationsExpiry()
      this.sockets.broadcast({
        v: 1,
        type: 'event',
        event: 'conversation.summary.changed',
        data: { conversation: message.conversation },
      })
      return
    }

    this.conversations.remove(message.conversationId)
    this.sockets.broadcast({
      v: 1,
      type: 'event',
      event: 'conversation.removed',
      data: { conversationId: message.conversationId },
    })
  }

  /**
   * A relay owns one alarm, and `setAlarm` replaces whatever was there.
   *
   * So the arming lives here rather than in the repository that benefits from
   * it: a second repository setting its own would silently cancel this one.
   */
  private async armConversationsExpiry(): Promise<void> {
    await this.ctx.storage.setAlarm(Date.now() + CONVERSATIONS_EXPIRY_MS)
  }

  /** The one durable fact this relay produces. Nothing else here reaches D1. */
  private async rememberSeen(hostId: z.infer<typeof HostIdSchema>): Promise<void> {
    await recordHostSeen(this.deps.hosts, hostId, new Date())
  }
}

/**
 * The relay as the Worker binds it, wrapped so its calls reach Sentry.
 *
 * The type and the value share a name, so a caller writes `HostRelayDO` for
 * either and the instrumentation never has to be spoken about again.
 */
export type HostRelayDO = InstanceType<typeof HostRelayDOBase>
export const HostRelayDO = Sentry.instrumentDurableObjectWithSentry(
  createSentryOptions,
  HostRelayDOBase,
)

/** Built, not parsed: the type is the contract on the way out. */
function hostStatus(status: 'online' | 'offline'): ClientMessage {
  return { v: 1, type: 'event', event: 'host.status', data: { status } }
}
