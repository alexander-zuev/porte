import { WebSocket as PartySocket } from 'partysocket'
import { WebSocket as NodeWebSocket } from 'ws'

/** A terminal failure found while PartySocket opens its WebSocket. */
export type WebSocketConnectionFailure = {
  readonly status: number
}

/** WebSocket operations used by the Host entrypoints. */
export type WebSocketClient = Pick<
  PartySocket,
  'addEventListener' | 'close' | 'reconnect' | 'removeEventListener' | 'retryCount' | 'send'
> & {
  /** The terminal connection failure, when PartySocket stopped reconnecting. */
  readonly connectionFailure: WebSocketConnectionFailure | undefined
}

/** Transport input for one authenticated PartySocket client. */
export type PartySocketClientInput = {
  readonly url: string
  readonly subprotocol: string
  readonly authorization: `Bearer ${string}`
}

/** Create one configured WebSocket client. */
export type WebSocketClientFactory = (input: PartySocketClientInput) => WebSocketClient

/** Create one authenticated PartySocket client with transport buffering disabled. */
export const createPartySocketClient: WebSocketClientFactory = (input) => {
  let connectionFailure: WebSocketConnectionFailure | undefined
  let handshakeResponseStatus: number | undefined

  const AuthenticatedWebSocket = class extends NodeWebSocket {
    constructor(address: string | URL, protocols?: string | string[]) {
      super(address, protocols ?? [], { headers: { Authorization: input.authorization } })
      this.once('unexpected-response', (_request, response) => {
        handshakeResponseStatus = response.statusCode ?? 0
        if (!shouldRetryHandshake(handshakeResponseStatus)) {
          connectionFailure = { status: handshakeResponseStatus }
        }
        response.resume()
        this.close()
      })
    }
  }

  const socket = new PartySocket(input.url, input.subprotocol, {
    WebSocket: AuthenticatedWebSocket,
    maxEnqueuedMessages: 0,
    shouldReconnectOnClose: (event) => {
      if (handshakeResponseStatus !== undefined) {
        handshakeResponseStatus = undefined
        return connectionFailure === undefined
      }
      return event.code !== 1000 && event.code !== 1008
    },
  })

  return {
    addEventListener: socket.addEventListener.bind(socket),
    close: socket.close.bind(socket),
    reconnect: socket.reconnect.bind(socket),
    removeEventListener: socket.removeEventListener.bind(socket),
    send: socket.send.bind(socket),
    get retryCount() {
      return socket.retryCount
    },
    get connectionFailure() {
      return connectionFailure
    },
  }
}

function shouldRetryHandshake(status: number): boolean {
  return (
    status === 0 ||
    status === 408 ||
    status === 425 ||
    status === 429 ||
    (status >= 500 && status <= 599)
  )
}
