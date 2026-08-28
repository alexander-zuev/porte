// @vitest-environment happy-dom
import type { HostRelayState } from '@porte/core/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, screen } from '@testing-library/react'
import { useHostConnection } from '@web/lib/host/use-host-connection.ts'
import { RelayProvider } from '@web/lib/relay/relay-provider.tsx'
import { memo, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

/**
 * Mirrors what `useAgent` really does: one mutable socket object whose identity
 * never changes, and `identified` and `state` kept as React state so each
 * change re-renders the hook's owner.
 */
class FakeAgent {
  identified = false
  state: HostRelayState | undefined = undefined
  rerender: () => void = () => undefined

  identify(): void {
    this.identified = true
    this.rerender()
  }

  close(): void {
    this.identified = false
    this.rerender()
  }

  receiveState(state: HostRelayState): void {
    this.state = state
    this.rerender()
  }
}

const fake = new FakeAgent()

vi.mock('agents/react', () => ({
  useAgent: () => {
    const [, tick] = useState(0)
    fake.rerender = () => {
      tick((n) => n + 1)
    }
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
  fake.identified = false
  fake.state = undefined
})

afterEach(cleanup)

describe('RelayProvider → useHostConnection', () => {
  it('follows the socket and the relay state through a full lifecycle', () => {
    const { status } = mountDot()
    expect(status()).toBe('loading')

    act(() => fake.identify())
    expect(status()).toBe('loading')

    act(() => fake.receiveState(online))
    expect(status()).toBe('connected')

    act(() => fake.close())
    expect(status()).toBe('connecting')

    act(() => fake.identify())
    expect(status()).toBe('connected')

    act(() => fake.receiveState(offline))
    expect(status()).toBe('offline')
  })

  it('refetches the conversation list only when the version moves', () => {
    const { invalidate } = mountDot()
    act(() => fake.identify())
    act(() => fake.receiveState(online))
    act(() => fake.receiveState({ ...online, hostStatus: 'offline' }))
    expect(invalidate).not.toHaveBeenCalled()
    act(() => fake.receiveState({ ...online, conversationsVersion: 1 }))
    expect(invalidate).toHaveBeenCalledTimes(1)
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['conversation', 'list'] })
    act(() => fake.receiveState({ ...online, conversationsVersion: 1 }))
    expect(invalidate).toHaveBeenCalledTimes(1)
  })
})
