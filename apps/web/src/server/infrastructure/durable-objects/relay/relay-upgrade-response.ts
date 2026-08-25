import { createLogger } from '@porte/core'
import type { AgentConnection } from '@server/application/ports/agent-connection.ts'

const logger = createLogger('relay-upgrade')

/** Select the protocol that one authenticated daemon offered. */
export function completeRelayUpgrade(
  input: AgentConnection,
  response: Response,
  expectedSubprotocol: string,
  target: 'control' | 'conversation',
): Response {
  if (input.role === 'client') return response

  const offered =
    input.request.headers
      .get('sec-websocket-protocol')
      ?.split(',')
      .map((protocol) => protocol.trim())
      .includes(expectedSubprotocol) === true

  if (response.status !== 101 || response.webSocket === null || !offered) {
    logger.warn('host_websocket_upgrade_failed', {
      hostId: input.hostId,
      target,
      status: response.status,
      hasWebSocket: response.webSocket !== null,
      expectedSubprotocol,
      subprotocolOffered: offered,
    })
    return response
  }

  const headers = new Headers(response.headers)
  headers.set('Sec-WebSocket-Protocol', expectedSubprotocol)
  logger.info('host_websocket_upgraded', {
    hostId: input.hostId,
    target,
    subprotocol: expectedSubprotocol,
  })
  return new Response(null, {
    status: 101,
    headers,
    webSocket: response.webSocket,
  })
}
