import type { HostRelayState } from '@porte/core/client'
import { hostConnectionFrom } from '@web/entities/host/host-connection.ts'
import { describe, expect, it } from 'vitest'

const online: HostRelayState = { hostStatus: 'online', activeConversations: [] }
const offline: HostRelayState = { hostStatus: 'offline', activeConversations: [] }
const { CONNECTING, OPEN, CLOSING, CLOSED } = WebSocket

describe('hostConnectionFrom', () => {
  it('is loading until the first state frame, whatever the socket is doing', () => {
    for (const readyState of [CONNECTING, OPEN, CLOSING, CLOSED]) {
      expect(hostConnectionFrom({ readyState, state: undefined })).toEqual({ status: 'loading' })
    }
  })

  it('is connecting whenever the socket is not open, even if the last state said online', () => {
    for (const readyState of [CONNECTING, CLOSING, CLOSED, 42]) {
      expect(hostConnectionFrom({ readyState, state: online })).toEqual({ status: 'connecting' })
    }
  })

  it('reports the Mac only through an open socket', () => {
    expect(hostConnectionFrom({ readyState: OPEN, state: online })).toEqual({ status: 'connected' })
    expect(hostConnectionFrom({ readyState: OPEN, state: offline })).toEqual({ status: 'offline' })
  })
})
