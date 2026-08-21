import {
  ClientMessageSchema,
  ClientMethodSchemas,
  createRequestId,
  type ClientMethodMap,
  type ConversationEvent,
  type ConversationId,
  type ConversationSummary,
  type RequestMessage,
} from '@porte/core/client'
import { z } from 'zod'

import { INITIAL_RELAY_STATE, type RelayState } from './relay-state.ts'

const textFrameSchema = z.string()

/** Anything the relay may push to a browser. */
type ClientMessage = z.infer<typeof ClientMessageSchema>

/** Where the browser reaches the relay. Same route the Mac uses; the cookie decides which side. */
const RELAY_PATH = '/api/host/ws'

const FIRST_RETRY_MS = 500
const MAX_RETRY_MS = 10_000
/** Past this the line is not blipping, it is down, and worth saying so. */
const GIVE_UP_AFTER_MS = 60_000

type Listener = () => void
type ConversationEventListener = (event: ConversationEvent) => void

/**
 * What the relay says about the list, never the list itself.
 *
 * A Mac's history has no bound, so pushing it through the socket would put all
 * of it in every open tab. One summary at a time, or a nudge to read again.
 */
export type RelayHandlers = {
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
  private socket: WebSocket | undefined
  private state: RelayState = INITIAL_RELAY_STATE
  private readonly listeners = new Set<Listener>()
  private readonly conversationListeners = new Set<ConversationEventListener>()
  private readonly pending = new Map<string, PendingRequest>()
  private retryMs = FIRST_RETRY_MS
  private retryTimer: ReturnType<typeof setTimeout> | undefined
  private downSince: number | undefined
  private closed = false

  constructor(private readonly handlers: RelayHandlers) {}

  /** Stable between changes, because `useSyncExternalStore` compares by identity. */
  getState = (): RelayState => this.state

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
    if (this.socket !== undefined) return

    const socket = new WebSocket(relayUrl())
    this.socket = socket

    // Nothing is asked on open. The relay sends the Mac's status as its first
    // frame, and the list arrived over HTTP before this socket existed.
    socket.addEventListener('open', () => {
      this.retryMs = FIRST_RETRY_MS
      this.downSince = undefined
      this.set({ line: 'open' })
    })

    socket.addEventListener('message', (event) => {
      const message = readClientMessage(event.data)
      // Anything unreadable is not ours. Dropping it is what a relay in front
      // of a proxy that injects its own frames would want anyway.
      if (message !== undefined) this.receive(message)
    })

    // Both endings are the same to us, and neither is exceptional: a line drops.
    socket.addEventListener('close', () => {
      this.dropped()
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
    this.socket?.close(1000, 'client left')
    this.socket = undefined
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
    const socket = this.socket
    if (socket === undefined || socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new RelayUnavailable())
    }

    const requestId = createRequestId()
    // SAFETY: `params` is already this method's params, so the four fields
    // beside it make exactly its request. The compiler cannot pair a generic
    // method with its own params across a union of every method.
    const message = { v: 1, type: 'request', requestId, method, params } as RequestMessage<Method>

    return new Promise((resolve, reject) => {
      // The entry keeps its own typed ending, so nothing has to remember which
      // method a loose result belongs to, or assert its way back to the type.
      this.pending.set(requestId, {
        settle: (answer) => {
          if (answer.kind === 'failed') {
            reject(answer.cause)
            return
          }

          const result = ClientMethodSchemas[method].result.safeParse(answer.result)
          if (!result.success) {
            reject(new RelayRefused(`Porte answered ${method} with something unreadable`))
            return
          }

          // SAFETY: the schema was looked up by the same `method` this promise
          // is typed with, so what it accepted is that method's result. The
          // compiler cannot follow an indexed schema through a generic key.
          resolve(result.data as ClientMethodMap[Method]['result'])
        },
      })
      socket.send(JSON.stringify(message))
    })
  }

  /** Everything the relay pushes: an answer to one of ours, or news for everyone. */
  private receive(message: ClientMessage): void {
    if (message.type === 'result') {
      this.settle(message.requestId, { kind: 'answered', result: message.result })
      return
    }
    if (message.type === 'error') {
      this.settle(message.requestId, {
        kind: 'failed',
        cause: new RelayRefused(message.error.message),
      })
      return
    }
    // A request only ever travels the other way, so nothing here can act on one.
    if (message.type === 'request') return

    if (message.event === 'host.status') {
      this.set({
        mac: {
          online: message.data.status === 'online',
          lastSeenAt: this.state.mac?.lastSeenAt ?? null,
        },
      })
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
  private dropped(): void {
    this.socket = undefined
    this.failPending('The connection dropped')
    if (this.closed) return

    this.downSince ??= Date.now()
    const givenUp = Date.now() - this.downSince > GIVE_UP_AFTER_MS
    this.set({ line: givenUp ? 'lost' : 'reconnecting' })
    if (givenUp) return

    this.retryTimer = setTimeout(() => {
      this.connect()
    }, this.retryMs)
    this.retryMs = Math.min(this.retryMs * 2, MAX_RETRY_MS)
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

  private set(change: Partial<RelayState>): void {
    this.state = { ...this.state, ...change }
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

/** How one asked question ends, whichever way it goes. */
type RelayAnswer =
  | { readonly kind: 'answered'; readonly result: unknown }
  | { readonly kind: 'failed'; readonly cause: Error }

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
