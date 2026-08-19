import type { HostView } from '@porte/core'
import { queryOptions } from '@tanstack/react-query'

import { getHostView } from '#/server/entrypoints/functions/host.fn.ts'

/** Query factory for the account's paired Mac. */
export const hostQueries = {
  view: () =>
    queryOptions({
      queryKey: ['host', 'view'] as const,
      queryFn: (): Promise<HostView> => getHostView(),
    }),
}

/** Every read that a host mutation invalidates. */
export const hostQueryKeys = {
  all: ['host'] as const,
}
