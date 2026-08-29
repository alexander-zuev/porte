import type { HostRelayState } from '@porte/core/client'
import { hostConnectionFrom, hostConnectionNotice } from '@web/entities/host/host-connection.ts'
import { describe, expect, it } from 'vitest'

const online: HostRelayState = {
  hostStatus: 'online',
  activeConversations: [],
  conversationsVersion: 0,
}
const offline: HostRelayState = {
  hostStatus: 'offline',
  activeConversations: [],
  conversationsVersion: 0,
}
describe('hostConnectionFrom', () => {
  it('is loading until the first state frame, whatever the socket is doing', () => {
    for (const identified of [false, true]) {
      expect(hostConnectionFrom({ identified, state: undefined })).toEqual({ status: 'loading' })
    }
  })

  it('is connecting while the relay has not answered, even if the last state said online', () => {
    expect(hostConnectionFrom({ identified: false, state: online })).toEqual({
      status: 'connecting',
    })
  })

  it('reports the Mac only through an identified socket', () => {
    expect(hostConnectionFrom({ identified: true, state: online })).toEqual({
      status: 'connected',
    })
    expect(hostConnectionFrom({ identified: true, state: offline })).toEqual({ status: 'offline' })
  })
})

describe('hostConnectionNotice', () => {
  it('speaks only when the Mac leaves or returns', () => {
    expect(hostConnectionNotice('connected', 'offline')).toBe('host-offline')
    expect(hostConnectionNotice('offline', 'connected')).toBe('host-online')
  })

  it('stays quiet on first load and on socket blips', () => {
    expect(hostConnectionNotice('loading', 'offline')).toBeUndefined()
    expect(hostConnectionNotice('loading', 'connected')).toBeUndefined()
    expect(hostConnectionNotice('connected', 'connecting')).toBeUndefined()
    expect(hostConnectionNotice('connecting', 'connected')).toBeUndefined()
  })
})
