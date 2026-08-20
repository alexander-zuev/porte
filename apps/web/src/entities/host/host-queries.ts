import { getAccountHost } from '@server/entrypoints/functions/host.fn.ts'
import { queryOptions } from '@tanstack/react-query'

/** Query factory for the account's paired Mac. */
export const hostQueries = {
  forAccount: () =>
    queryOptions({
      queryKey: ['host', 'account'] as const,
      queryFn: () => getAccountHost(),
    }),
}

/** Every read that a host mutation invalidates. */
export const hostQueryKeys = {
  all: ['host'] as const,
}
