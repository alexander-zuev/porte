import type { SessionSummary } from '@porte/core'
import { queryOptions } from '@tanstack/react-query'

export const sessionQueries = {
  catalog: () =>
    queryOptions({
      queryKey: ['session', 'catalog'] as const,
      queryFn: async (): Promise<readonly SessionSummary[]> => [],
    }),
}
