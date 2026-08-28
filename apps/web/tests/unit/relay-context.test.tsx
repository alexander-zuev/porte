// @vitest-environment happy-dom
import type { HostRelayState } from '@porte/core/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, screen } from '@testing-library/react'
import { RelayProvider } from '@web/entities/host/relay-context.tsx'
import { useHostConnection } from '@web/lib/host/use-host-connection.ts'
import { memo, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const online: HostRelayState = { hostStatus: 'online', activeConversations: [] }
const offline: HostRelayState = { hostStatus: 'offline', activeConversations: [] }

/**
 * Mirrors what `useAgent` really does: one mutable socket object whose identity
 * never changes. A state frame re-renders the hook's owner; a socket lifecycle
 * change only fires an event.
 */
class FakeAgent extends EventTarget {
  readyState: number = WebSocket.CONNECTING
  state: HostRelayState | undefined = undefined
  rerender: () => void = () => undefined
  readonly reconnect = vi.fn()
  onOpen: (() => void) | undefined

  open(): void {
    this.readyState = WebSocket.OPEN
    this.onOpen?.()
    this.dispatchEvent(new Event('open'))
  }

  close(): void {
    this.readyState = WebSocket.CLOSED
    this.dispatchEvent(new Event('close'))
  }

  receiveState(state: HostRelayState): void {
    this.state = state
    this.rerender()
  }
}

const fake = new FakeAgent()

vi.mock('agents/react', () => ({
  useAgent: (options: { onOpen?: () => void }) => {
    const [, tick] = useState(0)
    fake.rerender = () => {
      tick((n) => n + 1)
    }
    fake.onOpen = options.onOpen
    return fake
  },
}))

/** Memoized on purpose: only a changed context value may re-render it. */
const Dot = memo(function Dot() {
  return <output>{useHostConnection().status}</output>
})

function mountDot() {
  const queryClient = new QueryClient()
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
  render(
    <QueryClientProvider client={queryClient}>
      <RelayProvider>
        <Dot />
      </RelayProvider>
    </QueryClientProvider>,
  )
  return { invalidate, status: () => screen.getByRole('status').textContent }
}

beforeEach(() => {
  fake.readyState = WebSocket.CONNECTING
  fake.state = undefined
})

afterEach(cleanup)

describe('RelayProvider → useHostConnection', () => {
  it('follows the socket and the relay state through a full lifecycle', () => {
    const { status } = mountDot()
    expect(status()).toBe('loading')

    act(() => fake.open())
    expect(status()).toBe('loading')

    act(() => fake.receiveState(online))
    expect(status()).toBe('connected')

    act(() => fake.close())
    expect(status()).toBe('connecting')

    act(() => fake.open())
    expect(status()).toBe('connected')

    act(() => fake.receiveState(offline))
    expect(status()).toBe('offline')
  })

  it('re-renders a memoized consumer on a socket event alone', () => {
    fake.state = online
    const { status } = mountDot()
    expect(status()).toBe('connecting')
    act(() => fake.open())
    expect(status()).toBe('connected')
  })

  it('refetches the conversation list on every open, never on state', () => {
    const { invalidate } = mountDot()
    act(() => fake.receiveState(online))
    expect(invalidate).not.toHaveBeenCalled()
    act(() => fake.open())
    act(() => fake.close())
    act(() => fake.open())
    expect(invalidate).toHaveBeenCalledTimes(2)
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['conversation', 'list'] })
  })
})
