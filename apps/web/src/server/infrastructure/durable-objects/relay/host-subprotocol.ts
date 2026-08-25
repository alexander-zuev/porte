/**
 * True when the upgrade offered this WebSocket subprotocol.
 *
 * @param request - The inbound upgrade request.
 * @param expected - The subprotocol this socket must select.
 * @returns True when `Sec-WebSocket-Protocol` lists `expected`.
 */
export function hasSubprotocol(request: Request, expected: string): boolean {
  return (
    request.headers
      .get('sec-websocket-protocol')
      ?.split(',')
      .map((value) => value.trim())
      .includes(expected) === true
  )
}
