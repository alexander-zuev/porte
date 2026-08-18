import { queryOptions } from '@tanstack/react-query'

export type AppUser = {
  readonly id: string
}

export const userQueries = {
  session: () =>
    queryOptions({
      queryKey: ['user', 'session'] as const,
      queryFn: async (): Promise<AppUser | null> => null,
    }),
}
