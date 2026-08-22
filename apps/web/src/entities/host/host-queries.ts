import { getAccountHost, getHostStatus } from '@server/entrypoints/functions/host.fn.ts'
import { queryOptions } from '@tanstack/react-query'

/** Query factory for the account's paired Mac. */
export const hostQueries = {
  forAccount: () =>
    queryOptions({
      queryKey: ['host', 'account'] as const,
      queryFn: () => getAccountHost(),
    }),

  /**
   * Whether the Mac is reachable now.
   *
   * Read so a first paint is right rather than starting at "connecting". The
   * socket keeps it current afterwards by writing this key, so nothing here
   * polls and no refetch is needed to learn the Mac came back.
   */
  status: () =>
    queryOptions({
      queryKey: hostQueryKeys.status,
      queryFn: () => getHostStatus(),
      staleTime: Number.POSITIVE_INFINITY,
    }),
}

/** Every read that a host mutation invalidates. */
export const hostQueryKeys = {
  all: ['host'] as const,
  status: ['host', 'status'] as const,
}
