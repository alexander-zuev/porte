import type { BetterAuthOptions } from 'better-auth'

type SecondaryStorage = NonNullable<BetterAuthOptions['secondaryStorage']>

/**
 * Back Better Auth's short-lived records with Workers KV.
 *
 * Sessions, verification records, and rate-limit counters read from here
 * instead of D1. Values are opaque strings; Better Auth owns their shape.
 *
 * KV expires keys itself, so nothing sweeps this store.
 */
export function createKvSecondaryStorage(kv: KVNamespace): SecondaryStorage {
  return {
    get: (key) => kv.get(key),
    set: async (key, value, ttl) => {
      // KV rejects a TTL under 60 seconds, so shorter lifetimes round up.
      await kv.put(key, value, ttl === undefined ? undefined : { expirationTtl: Math.max(ttl, 60) })
    },
    delete: async (key) => {
      await kv.delete(key)
    },
  }
}
