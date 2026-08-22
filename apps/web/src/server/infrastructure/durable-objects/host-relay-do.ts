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
  type ConversationId,
  type ConversationPage,
  type ConversationPageQuery,
  type DaemonMessage,
  type HostStatus,
  type RelayMessage,
  type RequestMessage,
  type RoutedRequest,
} from '@porte/core'
import * as Sentry from '@sentry/cloudflare'
import { recordHostSeen } from '@server/application/commands/record-host-seen.command.ts'
import type { ConversationRepository } from '@server/domain/conversation/conversation.repository.ts'
import { createAppDeps, type AppDeps } from '@server/infrastructure/app-deps.ts'
import { createSentryOptions } from '@server/infrastructure/observability/sentry-options.ts'
import { createRelayDatabase } from '@server/infrastructure/persistence/relay/connection.ts'
import migrations from '@server/infrastructure/persistence/relay/migrations/migrations.js'
import { DrizzleConversationRepository } from '@server/infrastructure/persistence/repositories/conversation.repository.ts'
import type { RuntimeEnv } from '@server/infrastructure/runtime-env.ts'
import { DurableObject } from 'cloudflare:workers'
import { migrate } from 'drizzle-orm/durable-sqlite/migrator'
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

/** How old the stored list may be before a read asks the Mac to report again. */
const CONVERSATIONS_STALE_AFTER_MS = 30_000

/** A safety valve against a Mac with a pathological history, not a product limit. */
const MAX_CONVERSATION_ROWS = 10_000

/** The run a row carries when the Mac reported it before any full sync landed. */
const UNSYNCED = 'unsynced'

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
 * It hibernates, so nothing lives in a field: state is on the sockets or in
 * storage, and nothing is rehydrated at construction.
 */
class HostRelayDOBase extends DurableObject<RuntimeEnv> {
  private readonly sockets: RelaySockets
  private readonly conversationsRepo: ConversationRepository
  private readonly deps: AppDeps
  /** Undefined until this relay sees a sync finish, so a woken relay asks for one. */
  private lastSyncedAt: Date | undefined

  constructor(ctx: DurableObjectState, env: RuntimeEnv) {
    super(ctx, env)

    this.sockets = new RelaySockets(ctx)

    const db = createRelayDatabase(ctx.storage)
    // Under the gate, so no request sees a relay whose table does not exist yet.
    void ctx.blockConcurrencyWhile(() => migrate(db, migrations))
    this.conversationsRepo = new DrizzleConversationRepository(db)

    // The same dependencies every other entrypoint gets, rather than a second
    // place the wiring lives.
    this.deps = createAppDeps(env, ctx)
  }

  // —— Sockets ——

  async fetch(request: Request): Promise<Response> {
    const role = roleSchema.safeParse(request.headers.get(RELAY_ROLE_HEADER))
    const hostId = HostIdSchema.safeParse(request.headers.get(RELAY_HOST_ID_HEADER))
    if (!role.success || !hostId.success) return new Response('Forbidden', { status: 403 })

    const pair = new WebSocketPair()
    const [client, server] = [pair[0], pair[1]]

    if (role.data === 'daemon') this.daemonConnected(server, hostId.data)
    else this.clientConnected(server)

    return new Response(null, { status: 101, webSocket: client })
  }

  private daemonConnected(socket: WebSocket, hostId: z.infer<typeof HostIdSchema>): void {
    this.sockets.acceptDaemon(socket, hostId)
    this.sockets.broadcast(hostStatus('online'))
    // The arrival is an observation worth keeping after the Mac goes away.
    this.ctx.waitUntil(this.rememberSeen(hostId))
  }

  private clientConnected(socket: WebSocket): void {
    this.sockets.acceptClient(socket)
    // Told, not asked: otherwise a browser arriving after the Mac waits for a
    // departure to learn the Mac was ever there.
    this.sockets.send(socket, hostStatus(this.macStatus()))
  }

  /** No Mac socket is left. Says nothing about pairing, which outlives every connection. */
  private lastDaemonDisconnected(hostId: z.infer<typeof HostIdSchema>): void {
    this.sockets.broadcast(hostStatus('offline'))
    this.ctx.waitUntil(this.rememberSeen(hostId))
  }

  /**
   * By RPC, because the page asks over HTTP and keeps asking as it scrolls.
   *
   * Answers from the replica at once and never waits on the Mac. A fresh list
   * arrives on its own, as the invalidation every open tab already listens for.
   */
  readConversations(query: ConversationPageQuery): ConversationPage {
    const page = this.conversationsRepo.findPage(query)
    this.resyncIfStale()
    return page
  }

  /**
   * Whether the Mac is here, for a browser that has no socket yet.
   *
   * The same answer `host.status` carries, so a page reads it once over HTTP
   * and the frames that follow replace it without being converted.
   */
  readStatus(): HostStatus {
    return { status: this.macStatus() }
  }

  /**
   * Ask the Mac to report its list again, if nobody has lately.
   *
   * Reading is the only signal that somebody is looking, and a conversation
   * created or deleted in the Mac's own terminal reaches Porte no other way.
   */
  private resyncIfStale(): void {
    if (this.sockets.daemon() === undefined) return

    const since = this.lastSyncedAt
    if (since !== undefined && Date.now() - since.getTime() < CONVERSATIONS_STALE_AFTER_MS) return

    this.askMacToSync()
  }

  /**
   * End every connection this relay holds, and empty it. Called when pairing ends.
   *
   * Clients hear the Mac is gone before their socket closes, so an open page
   * explains itself. Re-pairing mints a new host id, so nothing ever addresses
   * this relay again and anything left would be billed and unread forever.
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

    this.conversationsRepo.deleteAll()
    this.lastSyncedAt = undefined
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
        this.forwardClientRequest(socket, attachment, read.json)
        return
      }

      // The Mac speaks a different vocabulary, and only its own is legal here.
      const message = DaemonMessageSchema.safeParse(read.json)
      if (!message.success) {
        logger.error('daemon_message_invalid', { details: { issues: message.error.message } })
        socket.close(1007, 'invalid daemon message')
        return
      }

      await this.dispatchDaemonMessage(message.data)
    } catch (error) {
      logger.error('host_message_failed', { error })
      socket.close(1011, 'host message failed')
    }
  }

  webSocketClose(socket: WebSocket, code: number, reason: string): void {
    const attachment = this.sockets.attachmentOf(socket)

    // A replaced daemon closes while its successor is already here, so the
    // Mac has only gone when no other socket remains.
    if (attachment?.role === 'daemon' && !this.sockets.hasOtherDaemon(socket)) {
      this.lastDaemonDisconnected(attachment.hostId)
    }
    if (attachment?.role === 'client') this.closeIfLastWatcherLeft(socket)

    socket.close(sendableCloseCode(code), reason)
  }

  /**
   * Let the Mac stop an agent nobody is watching.
   *
   * An open conversation is a live agent process with its servers, and a browser
   * that closed its tab says nothing about it. The last watcher leaving is the
   * only moment the relay can tell.
   */
  private closeIfLastWatcherLeft(leaving: WebSocket): void {
    const conversationId = this.sockets.watchedBy(leaving)
    if (conversationId === null) return

    this.sockets.watchConversation(leaving, null)
    if (this.sockets.conversationClients(conversationId, leaving).length > 0) return

    this.askMacToClose(conversationId)
  }

  /** Close a conversation the relay decided nobody is watching. */
  private askMacToClose(conversationId: ConversationId): void {
    this.askMac({
      v: 1,
      type: 'request',
      requestId: createRequestId(),
      method: 'conversation.close',
      params: { conversationId },
    })
  }

  /** Ask for the whole list again. Answered as `conversations.sync` frames, not as a result. */
  private askMacToSync(): void {
    this.askMac({
      v: 1,
      type: 'request',
      requestId: createRequestId(),
      method: 'conversations.sync',
      params: {},
    })
  }

  /**
   * Send a request the relay raised itself, with no browser waiting on it.
   *
   * Addressed from `RELAY_CONNECTION_ID`, so the answer routes to a client that
   * does not exist and is dropped. Nothing here reads a result.
   */
  private askMac(message: RequestMessage): void {
    const daemon = this.sockets.daemon()
    if (daemon === undefined) return

    const routed: RoutedRequest = { route: { connectionId: RELAY_CONNECTION_ID }, message }
    daemon.send(JSON.stringify(routed))
  }

  webSocketError(socket: WebSocket, cause: unknown): void {
    logger.error('host_socket_failed', { error: cause })
    socket.close(1011, 'host socket failed')
  }

  /** A browser asks, and every question it can ask is for the Mac. */
  private forwardClientRequest(
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
      logger.warn('relay_no_daemon', {
        details: { requestId: request.data.requestId, method: request.data.method },
      })
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
    logger.debug('relay_request_to_mac', {
      details: { requestId: request.data.requestId, method: request.data.method },
    })
    daemon.send(JSON.stringify(routed))
  }

  /** The Mac answers, reports, or tells the relay itself; each goes a different way. */
  private async dispatchDaemonMessage(message: DaemonMessage): Promise<void> {
    const response = RoutedResponseSchema.safeParse(message)
    if (response.success) {
      this.routeResponse(response.data)
      return
    }

    const relayed = RelayMessageSchema.safeParse(message)
    if (relayed.success) {
      await this.applyListChange(relayed.data)
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
    logger.debug('relay_response_from_mac', {
      details: {
        requestId: response.message.requestId,
        method: response.method,
        outcome: response.message.type,
      },
    })

    const target = this.sockets.client(response.route.connectionId)
    if (target === undefined) {
      this.closeForDepartedClient(response)
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
  private closeForDepartedClient(response: z.infer<typeof RoutedResponseSchema>): void {
    if (response.message.type !== 'result') return
    if (response.method !== 'conversation.open' && response.method !== 'conversation.create') return

    const opened = ClientMethodSchemas[response.method].result.safeParse(response.message.result)
    if (!opened.success) return

    logger.warn('conversation_opened_for_departed_client', {
      details: { conversationId: opened.data.conversation.id },
    })
    this.askMacToClose(opened.data.conversation.id)
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
  private async applyListChange(message: RelayMessage): Promise<void> {
    if (message.relay === 'conversations.sync') {
      this.conversationsRepo.saveAll(message.conversations, message.syncRunId)
      if (!message.done) return

      // Only now, on the last chunk: the sweep is what makes a conversation
      // deleted on the Mac disappear here, and a half-arrived list has nothing
      // to say about what is gone.
      this.conversationsRepo.deleteOtherThan(message.syncRunId)
      this.conversationsRepo.deleteBeyond(MAX_CONVERSATION_ROWS)
      this.lastSyncedAt = new Date()
      await this.armConversationsExpiry()
      this.sockets.broadcast({ v: 1, type: 'event', event: 'conversations.invalidated', data: {} })
      return
    }

    if (message.relay === 'conversation.summary') {
      // The live run, so the next sweep does not mistake this for a stale row.
      this.conversationsRepo.save(
        message.conversation,
        this.conversationsRepo.currentSyncRunId() ?? UNSYNCED,
      )
      await this.armConversationsExpiry()
      this.sockets.broadcast({
        v: 1,
        type: 'event',
        event: 'conversation.summary.changed',
        data: { conversation: message.conversation },
      })
      return
    }

    this.conversationsRepo.delete(message.conversationId)
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
