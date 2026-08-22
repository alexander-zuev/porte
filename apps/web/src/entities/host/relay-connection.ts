import {
  ClientMessageSchema,
  ClientMethodSchemas,
  RELAY_HEARTBEAT_REQUEST,
  RELAY_HEARTBEAT_RESPONSE,
  RelayHeartbeat,
  createLogger,
  createRequestId,
  type ApiError,
  type ClientMethodMap,
  type ConversationEvent,
  type ConversationId,
  type ConversationSummary,
  type RequestMessage,
} from '@porte/core/client'
import { z } from 'zod'

const textFrameSchema = z.string()

const logger = createLogger('relay-client')

/** Anything the relay may push to a browser. */
type ClientMessage = z.infer<typeof ClientMessageSchema>

/** Where the browser reaches the relay. Same route the Mac uses; the cookie decides which side. */
const RELAY_PATH = '/api/host/ws'

const FIRST_RETRY_MS = 500
/** Capped, not abandoned: a phone that slept for an hour must still come back on its own. */
const MAX_RETRY_MS = 10_000

type Listener = () => void
type ConversationEventListener = (event: ConversationEvent) => void
type RelaySocketState =
  | { readonly status: 'disconnected' }
  | { readonly status: 'connecting'; readonly socket: WebSocket }
  | { readonly status: 'open'; readonly socket: WebSocket; readonly heartbeat: RelayHeartbeat }

/**
 * What the relay says about the list, never the list itself.
 *
 * A Mac's history has no bound, so pushing it through the socket would put all
 * of it in every open tab. One summary at a time, or a nudge to read again.
 */
export type RelayHandlers = {
  readonly onHostStatus: (status: 'online' | 'offline') => void
  readonly onConversationsInvalidated: () => void
  readonly onConversationChanged: (conversation: ConversationSummary) => void
  readonly onConversationRemoved: (conversationId: ConversationId) => void
}

/**
 * The browser's line to its Mac.
 *
 * Plain TypeScript on purpose: it holds a socket and some state, which React
 * subscribes to rather than owns. That keeps every rule about reconnecting
 * testable without a component around it.
 *
 * One per signed-in session. Two would be two sockets, and the relay would
 * count two browsers where there is one.
 */
export class RelayConnection {
  private connection: RelaySocketState = { status: 'disconnected' }
  private readonly listeners = new Set<Listener>()
  private readonly conversationListeners = new Set<ConversationEventListener>()
  private readonly pending = new Map<string, PendingRequest>()
  private retryMs = FIRST_RETRY_MS
  private retryTimer: ReturnType<typeof setTimeout> | undefined
  private closed = false

  constructor(private readonly handlers: RelayHandlers) {}

  /**
   * The socket's own `readyState`, or `CLOSED` while there is no socket.
   *
   * Read from the platform rather than mirrored into a field, so nothing here
   * can disagree with the thing it describes.
   */
  getState = (): number =>
    this.connection.status === 'disconnected' ? WebSocket.CLOSED : this.connection.socket.readyState

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /**
   * Everything one open conversation says while somebody is listening.
   *
   * Separate from `subscribe`, which reports the line rather than its traffic.
   * A caller filters by turn: the relay sends a conversation's events to every
   * browser watching it, and a turn started elsewhere is still worth showing.
   */
  onConversationEvent = (listener: ConversationEventListener): (() => void) => {
    this.conversationListeners.add(listener)
    return () => this.conversationListeners.delete(listener)
  }

  /** Open the line. Safe to call again: an open socket is left alone. */
  connect(): void {
    this.closed = false
    if (this.connection.status !== 'disconnected') return

    const socket = new WebSocket(relayUrl())
    this.connection = { status: 'connecting', socket }

    // The relay sends the Mac's status first; heartbeat probes start after open.
    socket.addEventListener('open', () => {
      if (!this.isCurrent(socket) || this.closed) {
        socket.close(1000, 'client left')
        return
      }

      this.retryMs = FIRST_RETRY_MS
      const heartbeat = new RelayHeartbeat(
        () => {
          socket.send(RELAY_HEARTBEAT_REQUEST)
        },
        () => {
          socket.close(4000, 'heartbeat timeout')
          this.dropped(socket)
        },
      )
      this.connection = { status: 'open', socket, heartbeat }
      heartbeat.start()
      this.notify()
      logger.debug('relay_line_open')
    })

    socket.addEventListener('message', (event) => {
      if (!this.isCurrent(socket)) return

      if (event.data === RELAY_HEARTBEAT_RESPONSE) {
        if (this.connection.status === 'open') this.connection.heartbeat.acknowledge()
        return
      }

      const message = readClientMessage(event.data)
      // Anything unreadable is not ours. Dropping it is what a relay in front
      // of a proxy that injects its own frames would want anyway.
      if (message !== undefined) this.receive(message)
    })

    // Both endings are the same to us, and neither is exceptional: a line drops.
    socket.addEventListener('close', () => {
      this.dropped(socket)
    })
    socket.addEventListener('error', () => {
      socket.close()
    })
  }

  /** Put the line down for good. The state stays, so a remount shows what it knew. */
  close(): void {
    this.closed = true
    clearTimeout(this.retryTimer)
    this.failPending('The connection closed')
    const connection = this.connection
    this.connection = { status: 'disconnected' }
    if (connection.status === 'disconnected') return

    if (connection.status === 'open') connection.heartbeat.stop()
    connection.socket.close(1000, 'client left')
  }

  /**
   * Ask the Mac something and wait for its answer.
   *
   * The id is ours, and it is the only thing tying this question to the reply
   * that eventually arrives: frames come back in whatever order they finish.
   */
  request<Method extends keyof ClientMethodMap>(
    method: Method,
    params: ClientMethodMap[Method]['params'],
  ): Promise<ClientMethodMap[Method]['result']> {
    const connection = this.connection
    if (connection.status !== 'open' || connection.socket.readyState !== WebSocket.OPEN) {
      logger.warn('relay_request_unsent', { method, line: this.getState() })
      return Promise.reject(new RelayUnavailable())
    }
    const { socket } = connection

    const requestId = createRequestId()
    const asked = Date.now()
    // SAFETY: `params` is already this method's params, so the four fields
    // beside it make exactly its request. The compiler cannot pair a generic
    // method with its own params across a union of every method.
    const message = { v: 1, type: 'request', requestId, method, params } as RequestMessage<Method>

    return new Promise((resolve, reject) => {
      // The entry keeps its own typed ending, so nothing has to remember which
      // method a loose result belongs to, or assert its way back to the type.
      this.pending.set(requestId, {
        settle: (answer) => {
          const tookMs = Date.now() - asked
          if (answer.kind === 'failed') {
            logger.warn('relay_request_failed', { requestId, method, tookMs, error: answer.cause })
            reject(answer.cause)
            return
          }

          const result = ClientMethodSchemas[method].result.safeParse(answer.result)
          if (!result.success) {
            logger.error('relay_result_unreadable', {
              error: result.error,
              details: { requestId, method, tookMs },
            })
            reject(new RelayRefused(`Porte answered ${method} with something unreadable`))
            return
          }

          logger.debug('relay_request_answered', { requestId, method, tookMs })

          // SAFETY: the schema was looked up by the same `method` this promise
          // is typed with, so what it accepted is that method's result. The
          // compiler cannot follow an indexed schema through a generic key.
          resolve(result.data as ClientMethodMap[Method]['result'])
        },
      })
      logger.debug('relay_request_sent', { requestId, method })
      socket.send(JSON.stringify(message))
    })
  }

  /** Everything the relay pushes: an answer to one of ours, or news for everyone. */
  private receive(message: ClientMessage): void {
    if (message.type === 'result') {
      this.settle(message.requestId, { kind: 'answered', result: message.result })
      return
    }
    // The tagged error itself, not a copy of its message. A screen decides what
    // to say from the tag, and rewrapping it here leaves every failure looking
    // like the generic one.
    if (message.type === 'error') {
      this.settle(message.requestId, { kind: 'failed', cause: message.error })
      return
    }
    // A request only ever travels the other way, so nothing here can act on one.
    if (message.type === 'request') return

    // Handed on rather than kept: whether the Mac is here is the relay's fact,
    // and it is read over HTTP before this socket exists.
    if (message.event === 'host.status') {
      this.handlers.onHostStatus(message.data.status)
      return
    }
    if (message.event === 'conversations.invalidated') {
      this.handlers.onConversationsInvalidated()
      return
    }
    if (message.event === 'conversation.summary.changed') {
      this.handlers.onConversationChanged(message.data.conversation)
      return
    }
    if (message.event === 'conversation.removed') {
      this.handlers.onConversationRemoved(message.data.conversationId)
      return
    }
    if (message.event === 'conversation.event') {
      // One listener that throws must not starve the ones behind it: a chat
      // whose stream closed is exactly the listener that can, and the other
      // tabs watching the same conversation are unrelated to its failure.
      for (const listener of this.conversationListeners) {
        try {
          listener(message.data)
        } catch (cause) {
          console.error('Conversation listener failed', cause)
        }
      }
    }
  }

  /**
   * The line went down. Keep what we knew and try again.
   *
   * The Mac's status is left alone on purpose: we cannot see it from here, and
   * the last thing we heard is a better guess than pretending it went away.
   */
  private dropped(socket: WebSocket): void {
    if (!this.isCurrent(socket)) return

    if (this.connection.status === 'open') this.connection.heartbeat.stop()
    this.connection = { status: 'disconnected' }
    this.failPending('The connection dropped')
    if (this.closed) return

    this.notify()
    logger.warn('relay_line_dropped', { retryInMs: this.retryMs })

    this.retryTimer = setTimeout(() => {
      this.connect()
    }, this.retryMs)
    this.retryMs = Math.min(this.retryMs * 2, MAX_RETRY_MS)
  }

  private isCurrent(socket: WebSocket): boolean {
    return this.connection.status !== 'disconnected' && this.connection.socket === socket
  }

  private settle(requestId: string, answer: RelayAnswer): void {
    this.pending.get(requestId)?.settle(answer)
    this.pending.delete(requestId)
  }

  /** Nothing in flight can be answered by a socket that is gone. */
  private failPending(reason: string): void {
    for (const request of this.pending.values()) {
      request.settle({ kind: 'failed', cause: new RelayUnavailable(reason) })
    }
    this.pending.clear()
  }

  private notify(): void {
    for (const listener of this.listeners) listener()
  }
}

/** The line is not open, so the question cannot be asked at all. */
export class RelayUnavailable extends Error {
  constructor(message = 'Porte is not connected') {
    super(message)
    this.name = 'RelayUnavailable'
  }
}

/** The question arrived and was refused. */
export class RelayRefused extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RelayRefused'
  }
}

/**
 * How one asked question ends, whichever way it goes.
 *
 * A failure is an `ApiError` when the Mac or the relay named it, and one of ours
 * when the line itself is what went wrong.
 */
type RelayAnswer =
  | { readonly kind: 'answered'; readonly result: unknown }
  | { readonly kind: 'failed'; readonly cause: ApiError | Error }

type PendingRequest = { readonly settle: (answer: RelayAnswer) => void }

/** Same origin as the page, so the session cookie rides along untouched. */
function relayUrl(): string {
  const url = new URL(RELAY_PATH, window.location.href)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.toString()
}

/**
 * One frame, read into a message the relay could have sent.
 *
 * Binary frames and unparseable text are both simply not ours, so both answer
 * nothing rather than raising: a socket is not a request, and there is nobody
 * to report a bad frame to.
 */
function readClientMessage(frame: string | ArrayBuffer | Blob): ClientMessage | undefined {
  const text = textFrameSchema.safeParse(frame)
  if (!text.success) return undefined

  try {
    const parsed = ClientMessageSchema.safeParse(JSON.parse(text.data))
    return parsed.success ? parsed.data : undefined
  } catch {
    return undefined
  }
}
