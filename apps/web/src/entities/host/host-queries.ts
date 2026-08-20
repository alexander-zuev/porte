import { getHostView } from '@server/entrypoints/functions/host.fn.ts'
import { queryOptions } from '@tanstack/react-query'

/** Query factory for the account's paired Mac. */
export const hostQueries = {
  view: () =>
    queryOptions({
      queryKey: ['host', 'view'] as const,
      queryFn: () => getHostView(),
    }),
}

/** Every read that a host mutation invalidates. */
export const hostQueryKeys = {
  all: ['host'] as const,
}
