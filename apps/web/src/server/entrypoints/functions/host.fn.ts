import type { AccountActionResult, HostView } from '@porte/core'
import { createServerFn } from '@tanstack/react-start'

/**
 * Host and account entrypoints for the web client.
 *
 * Every handler is a stub returning the contract shape. Persistence is not
 * wired yet, so these describe the boundary rather than implement it.
 */

/** Read what the signed-in account controls. One Mac, or none. */
export const getHostView = createServerFn({ method: 'GET' }).handler(
  async (): Promise<HostView> => ({ state: 'unpaired' }),
)

/** Release the paired Mac. Local sessions and files on that Mac are untouched. */
export const unpairHost = createServerFn({ method: 'POST' }).handler(
  async (): Promise<AccountActionResult> => ({ ok: true }),
)

/** Remove the account, its pairing, and its session metadata. */
export const deleteAccount = createServerFn({ method: 'POST' }).handler(
  async (): Promise<AccountActionResult> => ({ ok: true }),
)
