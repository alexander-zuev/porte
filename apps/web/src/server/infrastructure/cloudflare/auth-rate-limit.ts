import { createLogger } from '@porte/core'

/**
 * Rate limiting for Better Auth, backed by the Workers binding.
 *
 * Not the built-in memory store: on Workers that is per-isolate, so counters
 * scatter across instances and bound nothing. Not KV either, which has no
 * atomic increment, so a read-then-write race would undercount exactly when a
 * caller is trying hardest to exceed the limit.
 */

const logger = createLogger('auth-rate-limit')

type RateLimitRule = { readonly window: number }

type ConsumeResult = { allowed: boolean; retryAfter: number | null }

/**
 * The shape Better Auth asks for.
 *
 * `get` and `set` are required by the interface but unreachable: Better Auth
 * uses `consume` alone wherever a storage provides it, and reserves the other
 * two for the older non-atomic path.
 */
export type AuthRateLimitStorage = {
  get: () => Promise<null>
  set: () => Promise<undefined>
  consume: (key: string, rule: RateLimitRule) => Promise<ConsumeResult>
}

let outageLogged = false

export function createAuthRateLimitStorage(binding: RateLimit): AuthRateLimitStorage {
  return {
    get: () => Promise.resolve(null),
    set: () => Promise.resolve(undefined),

    /**
     * Count one request and say whether it may proceed.
     *
     * Better Auth keys this by address and path, so each endpoint counts on its
     * own. A binding failure allows the request: locking every account out of
     * signing in is worse than briefly failing to slow one caller down. It is
     * logged because a limiter that has quietly stopped working looks exactly
     * like one that is working.
     */
    async consume(key, rule) {
      try {
        const { success } = await binding.limit({ key })
        return { allowed: success, retryAfter: success ? null : rule.window }
      } catch (error) {
        // Once per isolate: a failing binding fails on every request.
        if (!outageLogged) {
          outageLogged = true
          logger.error('rate_limit_binding_unavailable', { error })
        }
        return { allowed: true, retryAfter: null }
      }
    },
  }
}
