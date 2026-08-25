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
   * First paint reads the server. The socket writes this key when the Mac
   * changes. Query refetches on mount, focus, and network reconnect.
   */
  status: () =>
    queryOptions({
      queryKey: hostQueryKeys.status,
      queryFn: () => getHostStatus(),
    }),
}

/** Every read that a host mutation invalidates. */
export const hostQueryKeys = {
  all: ['host'] as const,
  status: ['host', 'status'] as const,
}
