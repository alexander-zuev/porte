import { Result } from 'better-result'

import {
  DurableObjectCallError,
  isDurableObjectCallError,
} from '../errors/durable-object.errors.ts'
import { shouldRetryFailure } from '../errors/retry-policy.ts'

/**
 * Bounded, jittered, and short: a caller is waiting on the other side of this.
 * `times` counts repeats after the first call, so this is three calls at most.
 */
const RETRY = { times: 2, delayMs: 25, backoff: 'exponential', jitter: true } as const

/** Resolves a fresh RPC stub for one named Durable Object. */
export type DurableObjectResolver<Object extends object> = {
  getByName(name: string): Object | Promise<Object>
}

/** One call against one resolved object. */
type Call<Object extends object, R> = (object: Object) => Promise<R>

/**
 * How the Worker reaches one namespace of Durable Objects.
 *
 * A client per namespace names the operations its callers mean, and says which
 * of them may be repeated. Everything else — picking the object, retrying,
 * converting a failure — happens here, once, for every Durable Object.
 */
export abstract class DurableObjectClient<
  T extends Rpc.DurableObjectBranded,
  Object extends object = DurableObjectStub<T>,
> {
  constructor(private readonly objects: DurableObjectResolver<Object>) {}

  /** Running this twice equals running it once, so a dropped call is retried. */
  protected repeatable<R>(name: string, work: Call<Object, R>): Promise<R> {
    return this.run(name, work, true)
  }

  /** One shot. A dropped call stays dropped, because repeating it is not safe. */
  protected once<R>(name: string, work: Call<Object, R>): Promise<R> {
    return this.run(name, work, false)
  }

  /**
   * Run one call, and convert what survives into one typed error.
   *
   * The caller is waiting, so this is an immediate retry owner: a failure it
   * cannot classify is not repeated here. Storing the work and trying again
   * later is a different owner's decision.
   *
   * The stub is taken inside each attempt, because a reset leaves the previous
   * one permanently broken and a retry that reused it could only fail again.
   */
  private async run<R>(name: string, work: Call<Object, R>, repeatSafe: boolean): Promise<R> {
    const called = await Result.tryPromise(
      {
        try: async () => work(await this.objects.getByName(name)),
        catch: (cause) => new DurableObjectCallError({ cause }),
      },
      {
        retry: {
          ...RETRY,
          shouldRetry: (error) =>
            shouldRetryFailure({
              classification: error.classification,
              repeatSafe,
              owner: 'immediate',
            }),
        },
      },
    )

    if (called.isErr()) {
      const failure = called.error
      if (failure.classification === 'unknown' || isDurableObjectCallError(failure.cause)) {
        throw failure.cause
      }
      throw failure
    }
    return called.value
  }
}
