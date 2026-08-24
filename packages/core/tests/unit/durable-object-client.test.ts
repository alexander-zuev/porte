import {
  classifyDurableObjectError,
  DurableObjectCallError,
  DurableObjectClient,
  HostOfflineError,
} from '@porte/core'
import { describe, expect, it, vi } from 'vitest'

/**
 * The tests drive the work, not the object, so the stub only has to exist.
 *
 * SAFETY: `call` hands the stub to a callback that ignores it. Building a real
 * namespace would mean six members no test touches.
 */
// oxlint-disable-next-line anti-slop/no-chained-type-assertions, typescript/no-unsafe-type-assertion -- Faking a platform binding needs the hop.
const namespace = { getByName: () => ({}) } as unknown as DurableObjectNamespace<never>

/** The base class is abstract, so the tests reach it through a real client. */
class TestClient extends DurableObjectClient<never> {
  attempt<T>(work: () => Promise<T>, repeatSafe: boolean): Promise<T> {
    return repeatSafe ? this.repeatable('object', work) : this.once('object', work)
  }
}

const client = new TestClient(namespace)
const run = <T>(work: () => Promise<T>, repeatSafe: boolean) => client.attempt(work, repeatSafe)

describe('DurableObjectClient', () => {
  it('retries a retryable failure when repetition is safe', async () => {
    const cause = Object.assign(new Error('DO reset'), { retryable: true })
    const call = vi.fn<() => Promise<string>>().mockRejectedValueOnce(cause).mockResolvedValue('ok')

    await expect(run(call, true)).resolves.toBe('ok')
    expect(call).toHaveBeenCalledTimes(2)
  })

  it.each([
    'Network connection lost',
    'Caused object to be reset',
    'Reset because its code was updated',
    'Object has moved to a different machine',
    'fetch failed',
    'request timed out',
    'connection refused',
  ])('retries the known transient message: %s', async (message) => {
    const call = vi.fn<() => Promise<string>>().mockRejectedValueOnce(new Error(message))
    call.mockResolvedValue('ok')

    await expect(run(call, true)).resolves.toBe('ok')
    expect(call).toHaveBeenCalledTimes(2)
  })

  it('classifies a transient nested cause', () => {
    const cause = Object.assign(new Error('DO reset'), { retryable: true })

    expect(classifyDurableObjectError(Object.assign(new Error('RPC failed'), { cause }))).toBe(
      'transient',
    )
  })

  it('keeps a nested overload terminal for the same stub', () => {
    const cause = Object.assign(new Error('DO overloaded'), { overloaded: true })
    const error = Object.assign(new Error('RPC failed'), { cause, retryable: true })

    expect(classifyDurableObjectError(error)).toBe('terminal')
  })

  it('leaves an unrecognised failure unknown', () => {
    expect(classifyDurableObjectError(new TypeError('invalid client code'))).toBe('unknown')
  })

  it('does not retry an overloaded Durable Object', async () => {
    const cause = Object.assign(new Error('DO overloaded'), { overloaded: true })
    const call = vi.fn(async () => Promise.reject(cause))

    await expect(run(call, true)).rejects.toMatchObject({
      cause,
      classification: 'terminal',
    })
    expect(call).toHaveBeenCalledOnce()
  })

  it('converts an exhausted failure into one typed error', async () => {
    const cause = Object.assign(new Error('DO reset'), { retryable: true })

    const call = vi.fn(async () => Promise.reject(cause))
    const failed = run(call, true)

    await expect(failed).rejects.toBeInstanceOf(DurableObjectCallError)
    await expect(failed).rejects.toMatchObject({ cause, classification: 'transient' })
    expect(call).toHaveBeenCalledTimes(3)
  })

  it('does not retry when repetition is unsafe', async () => {
    const cause = Object.assign(new Error('DO reset'), { retryable: true })
    const call = vi.fn(async () => Promise.reject(cause))

    await expect(run(call, false)).rejects.toBeInstanceOf(DurableObjectCallError)
    expect(call).toHaveBeenCalledOnce()
  })

  it('preserves an unknown failure without repeating it', async () => {
    const cause = new TypeError('invalid client code')
    const call = vi.fn(async () => Promise.reject(cause))

    await expect(run(call, true)).rejects.toBe(cause)
    expect(call).toHaveBeenCalledOnce()
  })

  it('preserves a tagged application failure', async () => {
    const cause = new HostOfflineError()

    await expect(run(async () => Promise.reject(cause), false)).rejects.toBe(cause)
  })

  it('does not wrap an existing call failure again', async () => {
    const platform = Object.assign(new Error('DO reset'), { retryable: true })
    const cause = new DurableObjectCallError({ cause: platform })

    await expect(run(async () => Promise.reject(cause), false)).rejects.toBe(cause)
  })
})
