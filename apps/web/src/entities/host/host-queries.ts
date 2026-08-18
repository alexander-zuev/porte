import type { HostSnapshot } from '@lras/core'
import { queryOptions } from '@tanstack/react-query'

export const hostQueries = {
  snapshot: () =>
    queryOptions({
      queryKey: ['host', 'snapshot'] as const,
      queryFn: async (): Promise<HostSnapshot> => ({
        status: 'offline',
        catalog: { state: 'never-synced' },
      }),
    }),
}
