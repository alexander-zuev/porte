import { queryOptions } from '@tanstack/react-query'

import { getPairingClaim } from '#/server/entrypoints/functions/pairing.fn.ts'

/**
 * Query factory for the claim awaiting a decision.
 *
 * Never cached: the claim lives in a cookie with a ten-minute life, and a
 * stale answer would either show a decided code or hide a live one.
 */
export const pairingQueries = {
  claim: () =>
    queryOptions({
      queryKey: ['pairing', 'claim'] as const,
      queryFn: () => getPairingClaim(),
      staleTime: 0,
      gcTime: 0,
    }),
}

/** Every read that a pairing mutation invalidates. */
export const pairingQueryKeys = {
  all: ['pairing'] as const,
}
