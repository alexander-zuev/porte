import type { AccountActionResult, AccountHost } from '@porte/core/client'
import { unpairHost as unpairHostCommand } from '@server/application/commands/unpair-host.command.ts'
import { getAccountHost as getAccountHostQuery } from '@server/application/queries/get-account-host.query.ts'
import { requireAuth } from '@server/entrypoints/middleware/auth.middleware.ts'
import { createServerFn } from '@tanstack/react-start'

/**
 * Host and account entrypoints for the web client.
 *
 * `requireAuth` resolves the account, so each handler only dispatches. Queries
 * read through the read-only connection; commands go through the repository.
 */

/** Read what the signed-in account controls. One machine, or none. */
export const getAccountHost = createServerFn({ method: 'GET' })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<AccountHost> => {
    return getAccountHostQuery(context.deps.db(), context.user.id)
  })

/** Release the paired machine. Local sessions and files on that machine are untouched. */
export const unpairHost = createServerFn({ method: 'POST' })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<AccountActionResult> => {
    return unpairHostCommand(
      context.deps.hosts,
      context.deps.hostRelay,
      context.user.id,
      new Date(),
    )
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
