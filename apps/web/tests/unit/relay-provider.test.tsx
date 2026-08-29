// @vitest-environment happy-dom
import { HostIdSchema, type AccountHost, type HostRelayState } from '@porte/core/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, screen } from '@testing-library/react'
import { hostQueries } from '@web/entities/host/host-queries.ts'
import { RelayProvider } from '@web/features/relay/relay-provider.tsx'
import { useHostConnection } from '@web/features/relay/use-host-connection.ts'
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
const sockets = vi.fn()

vi.mock('agents/react', () => ({
  useAgent: () => {
    const [, tick] = useState(0)
    sockets()
    fake.rerender = () => {
      tick((n) => n + 1)
    }
    return fake
  },
}))

const PAIRED: AccountHost = {
  state: 'paired',
  host: {
    id: HostIdSchema.parse('01990000-0000-7000-8000-000000000001'),
    name: 'Mac',
    platform: 'darwin',
    lastSeenAt: null,
  },
}

/** Memoized on purpose: only a changed context value may re-render it. */
const Dot = memo(function Dot() {
  return <output>{useHostConnection().status}</output>
})

function mountDot(owned: AccountHost = PAIRED) {
  const queryClient = new QueryClient()
  queryClient.setQueryData(hostQueries.forAccount().queryKey, owned)
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
  sockets.mockClear()
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
    const listRefetches = () =>
      invalidate.mock.calls.filter(([f]) => f?.queryKey?.[0] === 'conversation').length
    act(() => fake.identify())
    act(() => fake.receiveState(online))
    expect(listRefetches()).toBe(0)
    act(() => fake.receiveState({ ...online, conversationsVersion: 1 }))
    expect(listRefetches()).toBe(1)
    act(() => fake.receiveState({ ...online, conversationsVersion: 1 }))
    expect(listRefetches()).toBe(1)
  })

  it('re-reads the host row when the machine leaves or returns', () => {
    const { invalidate } = mountDot()
    act(() => fake.identify())
    act(() => fake.receiveState(online))
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: ['host'] })
    act(() => fake.receiveState(offline))
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['host'] })
  })

  it('opens no socket for an unpaired account', () => {
    const { status } = mountDot({ state: 'unpaired' })
    expect(sockets).not.toHaveBeenCalled()
    expect(status()).toBe('loading')
  })
})
