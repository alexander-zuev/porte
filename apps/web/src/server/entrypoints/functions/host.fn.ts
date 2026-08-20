import type { AccountActionResult, HostView } from '@porte/core'
import { createServerFn } from '@tanstack/react-start'

import { unpairHost as unpairHostCommand } from '../../application/commands/unpair-host.command.ts'
import { getHostView as getHostViewQuery } from '../../application/queries/get-host-view.query.ts'
import { requireAuth } from '../middleware/auth.middleware.ts'

/**
 * Host and account entrypoints for the web client.
 *
 * `requireAuth` resolves the account, so each handler only dispatches. Queries
 * read through the read-only connection; commands go through the repository.
 */

/** Read what the signed-in account controls. One Mac, or none. */
export const getHostView = createServerFn({ method: 'GET' })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<HostView> => {
    return getHostViewQuery(context.deps.db(), context.userId)
  })

/** Release the paired Mac. Local sessions and files on that Mac are untouched. */
export const unpairHost = createServerFn({ method: 'POST' })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<AccountActionResult> => {
    return unpairHostCommand(context.deps.hosts, context.userId, new Date())
  })

/**
 * Remove the account, its pairing, and its session metadata.
 *
 * Still a stub: deleting the user is a Better Auth operation that has to be
 * enabled and given a confirmation flow, and the host row follows by cascade.
 */
export const deleteAccount = createServerFn({ method: 'POST' })
  .middleware([requireAuth])
  .handler(async (): Promise<AccountActionResult> => ({ ok: true }))
