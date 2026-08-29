import { deleteAccount, unpairHost } from '@server/entrypoints/functions/host.fn.ts'

import { hostQueryKeys } from './host-queries.ts'

/**
 * Mutation factories for the account's machine.
 *
 * Each one invalidates the host view, so the surface moves to its next state
 * from the server's answer rather than from an optimistic guess.
 */
export const hostMutations = {
  unpair: () => ({
    mutationKey: [...hostQueryKeys.all, 'unpair'] as const,
    mutationFn: () => unpairHost(),
  }),
  deleteAccount: () => ({
    mutationKey: [...hostQueryKeys.all, 'delete-account'] as const,
    mutationFn: () => deleteAccount(),
  }),
}
