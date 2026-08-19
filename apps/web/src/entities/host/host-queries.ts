import type { HostSnapshot } from '@porte/core'
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
