// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/react'
import {
  useReconnectOnWake,
  type WakeableSocket,
} from '@web/features/relay/use-reconnect-on-wake.ts'
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(cleanup)

function Probe({ socket }: { socket: WakeableSocket }) {
  useReconnectOnWake(socket)
  return null
}

function mount(readyState: number) {
  const socket = { readyState, reconnect: vi.fn() }
  render(<Probe socket={socket} />)
  return socket
}

describe('useReconnectOnWake', () => {
  it('reconnects a closed socket when the browser comes online', () => {
    const socket = mount(WebSocket.CLOSED)
    window.dispatchEvent(new Event('online'))
    expect(socket.reconnect).toHaveBeenCalledTimes(1)
  })

  it('reconnects a closed socket when the page is shown again', () => {
    const socket = mount(WebSocket.CLOSED)
    document.dispatchEvent(new Event('visibilitychange'))
    expect(socket.reconnect).toHaveBeenCalledTimes(1)
  })

  it('leaves an open socket alone', () => {
    const socket = mount(WebSocket.OPEN)
    window.dispatchEvent(new Event('online'))
    document.dispatchEvent(new Event('visibilitychange'))
    expect(socket.reconnect).not.toHaveBeenCalled()
  })
})
