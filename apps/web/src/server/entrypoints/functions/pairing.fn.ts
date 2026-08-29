import type { PairingClaim, PairingDecision, PairingOrigin } from '@porte/core/client'
import { PairingCodeSchema, PairingVerdictSchema } from '@porte/core/client'
import { claimPairing as claimPairingCommand } from '@server/application/commands/claim-pairing.command.ts'
import { decidePairing as decidePairingCommand } from '@server/application/commands/decide-pairing.command.ts'
import { getPairingOrigin } from '@server/application/queries/get-pairing-origin.query.ts'
import { requireAuth } from '@server/entrypoints/middleware/auth.middleware.ts'
import { createServerFn } from '@tanstack/react-start'
import { deleteCookie, getCookie, getRequestHeaders, setCookie } from '@tanstack/react-start/server'

/**
 * Pairing entrypoints for the browser.
 *
 * `requireAuth` resolves the account, so each handler only dispatches. The
 * device authorization plugin owns the code's whole life behind
 * `deps.pairingAuthority`; see docs/ux-flows.md, Pairing Implementation Decision.
 */

/**
 * Which code the browser is deciding on.
 *
 * Held in a cookie rather than the URL, so the confirmation page can be
 * reloaded and shared without carrying a live code in history. Its life matches
 * the code's, which is why a missing cookie reads as an expired attempt.
 */
const CLAIM_COOKIE = 'porte_pairing'
const CLAIM_MAX_AGE = 10 * 60

/** Bind a code to this account, and remember it for the confirmation page. */
export const claimPairing = createServerFn({ method: 'POST' })
  .middleware([requireAuth])
  .validator(PairingCodeSchema)
  .handler(async ({ data, context }): Promise<PairingClaim> => {
    const claim = await claimPairingCommand(
      context.deps.pairingAuthority,
      context.deps.pairingOrigins,
      data,
      getRequestHeaders().get('cf-connecting-ip'),
    )

    if (claim.state === 'claimed') {
      setCookie(CLAIM_COOKIE, data, {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/',
        maxAge: CLAIM_MAX_AGE,
      })
    }
    return claim
  })

/**
 * The claim waiting to be decided, if there is one.
 *
 * Both the confirmation route's guard and the source of what it shows, so a
 * reload rebuilds the page from the server rather than from state that is gone.
 */
export const getPairingClaim = createServerFn({ method: 'GET' })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<PendingClaim> => {
    const claimed = PairingCodeSchema.safeParse(getCookie(CLAIM_COOKIE))
    if (!claimed.success) return { claimed: false }

    return {
      claimed: true,
      requestedFrom: await getPairingOrigin(
        context.deps.pairingOrigins,
        claimed.data,
        getRequestHeaders().get('cf-connecting-ip'),
      ),
    }
  })

/** What the confirmation route needs before it renders anything. */
export type PendingClaim =
  | { readonly claimed: false }
  | { readonly claimed: true; readonly requestedFrom: PairingOrigin }

/** Settle the claimed code, either way. Approval lets the machine have a session. */
export const decidePairing = createServerFn({ method: 'POST' })
  .middleware([requireAuth])
  .validator(PairingVerdictSchema)
  .handler(async ({ data, context }): Promise<PairingDecision> => {
    // A cookie is client-editable, so it is validated like any other input.
    // Absent and tampered mean the same thing here: no attempt left to decide.
    const claimed = PairingCodeSchema.safeParse(getCookie(CLAIM_COOKIE))
    if (!claimed.success) return { state: 'expired' }

    const decision = await decidePairingCommand(
      context.deps.pairingAuthority,
      context.deps.pairingOrigins,
      context.deps.hosts,
      { code: claimed.data, verdict: data, userId: context.user.id, decidedAt: new Date() },
    )
    deleteCookie(CLAIM_COOKIE, { path: '/' })
    return decision
  })
