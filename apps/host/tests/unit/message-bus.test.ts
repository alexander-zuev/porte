import { NoHandlerError } from '@host/application/errors/message-bus-errors.ts'
import {
  COMMAND_HANDLERS,
  EVENT_HANDLERS,
  QUERY_HANDLERS,
} from '@host/application/handlers/registry.ts'
import type { MessageRegistry } from '@host/application/handlers/types.ts'
import { MessageBus } from '@host/application/message-bus.ts'
import type { MessageBase } from '@host/domain/messages/base.ts'
import type { AppDeps } from '@host/infrastructure/app-deps.ts'
import { Logger } from '@porte/core/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createTestDeps } from '../support/test-deps.ts'

type Add = MessageBase<'command', 'Add', { a: number; b: number }>
type Fail = MessageBase<'command', 'Fail', object>
type Count = MessageBase<'query', 'Count', object>
type Pinged = MessageBase<'event', 'Pinged', { from: string }>
type Echoed = MessageBase<'event', 'Echoed', { from: string }>
type Subscriber<E> = (event: E, deps: AppDeps) => Promise<void>

// The real registries plus test slots. Typed on its own so the structural check against
// `MessageRegistry` skips excess-property rules.
type TestRegistry = {
  commands: typeof COMMAND_HANDLERS & {
    Add: (command: Add, deps: AppDeps) => Promise<number>
    Fail: (command: Fail, deps: AppDeps) => Promise<void>
  }
  events: typeof EVENT_HANDLERS & { Pinged: Subscriber<Pinged>[]; Echoed: Subscriber<Echoed>[] }
  queries: typeof QUERY_HANDLERS & { Count: (query: Count, deps: AppDeps) => Promise<number> }
}

function pinged(from: string): Pinged {
  return { type: 'event', name: 'Pinged', from }
}

function makeBus(
  subscribers: { pinged?: Subscriber<Pinged>[]; echoed?: Subscriber<Echoed>[] } = {},
) {
  const deps = createTestDeps()
  const registry: TestRegistry = {
    commands: {
      ...COMMAND_HANDLERS,
      Add: async (command, d) => {
        d.outbox.push([pinged('Add')])
        return command.a + command.b
      },
      Fail: async (_command, d) => {
        d.outbox.push([pinged('Fail')])
        throw new Error('handler failed')
      },
    },
    events: {
      ...EVENT_HANDLERS,
      Pinged: subscribers.pinged ?? [],
      Echoed: subscribers.echoed ?? [],
    },
    queries: { ...QUERY_HANDLERS, Count: async (_query, d) => d.outbox.drain().length },
  }
  const asRegistry: MessageRegistry = registry
  return { bus: new MessageBus(deps, asRegistry), deps }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('MessageBus', () => {
  it('routes a command to its one handler and returns its result', async () => {
    const { bus } = makeBus()
    await expect(bus.handle({ type: 'command', name: 'Add', a: 2, b: 3 })).resolves.toBe(5)
  })

  it('routes a query to its one handler with deps', async () => {
    const { bus } = makeBus()
    await expect(bus.handle({ type: 'query', name: 'Count' })).resolves.toBe(0)
  })

  it('throws NoHandlerError for an unregistered command or query', async () => {
    const { bus } = makeBus()
    await expect(bus.handle({ type: 'command', name: 'Nope' })).rejects.toBeInstanceOf(
      NoHandlerError,
    )
    await expect(bus.handle({ type: 'query', name: 'Nope' })).rejects.toBeInstanceOf(NoHandlerError)
  })

  it('drains outbox events after the handler returns, before the caller resumes', async () => {
    const order: string[] = []
    const { bus, deps } = makeBus({
      pinged: [
        async (event) => {
          order.push(`subscriber:${event.from}`)
        },
      ],
    })
    await bus.handle({ type: 'command', name: 'Add', a: 1, b: 1 })
    order.push('caller')
    expect(order).toEqual(['subscriber:Add', 'caller'])
    expect(deps.outbox.drain()).toEqual([])
  })

  it('drains events raised by a subscriber in the same handle call', async () => {
    const seen: string[] = []
    const { bus } = makeBus({
      pinged: [
        async (event, d) => {
          const echoed: Echoed = { type: 'event', name: 'Echoed', from: event.from }
          d.outbox.push([echoed])
        },
      ],
      echoed: [
        async (event) => {
          seen.push(event.from)
        },
      ],
    })
    await bus.handle({ type: 'command', name: 'Add', a: 1, b: 1 })
    expect(seen).toEqual(['Add'])
  })

  it('runs every subscriber when one throws, logs it once, and still returns the result', async () => {
    // The shared logger is disabled under NODE_ENV=test, so observe the call, not the sink.
    const logged = vi.spyOn(Logger.prototype, 'error')
    const second = vi.fn(async () => undefined)
    const { bus } = makeBus({
      pinged: [
        async () => {
          throw new Error('boom')
        },
        second,
      ],
    })
    await expect(bus.handle({ type: 'command', name: 'Add', a: 1, b: 2 })).resolves.toBe(3)
    expect(second).toHaveBeenCalledOnce()
    expect(logged).toHaveBeenCalledOnce()
    expect(logged).toHaveBeenCalledWith(
      'event_handler_failed',
      expect.objectContaining({ details: { eventName: 'Pinged', handlerIndex: 0 } }),
    )
  })

  it('propagates a handler error and still delivers events raised before the throw', async () => {
    const seen: string[] = []
    const { bus, deps } = makeBus({
      pinged: [
        async (event) => {
          seen.push(event.from)
        },
      ],
    })
    await expect(bus.handle({ type: 'command', name: 'Fail' })).rejects.toThrow('handler failed')
    expect(seen).toEqual(['Fail'])
    expect(deps.outbox.drain()).toEqual([])
  })

  it('accepts an event with no subscribers', async () => {
    const { bus } = makeBus()
    await expect(bus.handle({ type: 'event', name: 'Unheard' })).resolves.toBeUndefined()
  })

  it('starts subscribers in registry order', async () => {
    const order: string[] = []
    const { bus } = makeBus({
      pinged: [
        async () => {
          order.push('first')
        },
        async () => {
          order.push('second')
        },
      ],
    })
    await bus.handle({ type: 'command', name: 'Add', a: 0, b: 0 })
    expect(order).toEqual(['first', 'second'])
  })
})
