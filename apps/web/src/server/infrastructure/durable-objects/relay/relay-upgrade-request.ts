import type { HostId } from '@porte/core'

import { RELAY_HOST_ID_HEADER } from './relay-headers.ts'

/** Remove spent credentials and add the Worker-resolved Host identity. */
export function createRelayUpgradeRequest(input: {
  readonly hostId: HostId
  readonly request: Request
}): Request {
  const headers = new Headers(input.request.headers)
  headers.delete('authorization')
  headers.set(RELAY_HOST_ID_HEADER, input.hostId)
  return new Request(input.request.url, {
    body: input.request.body,
    headers,
    method: input.request.method,
  })
}
