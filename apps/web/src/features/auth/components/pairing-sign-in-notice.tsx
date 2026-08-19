import { ShieldCheckIcon } from '@phosphor-icons/react'

import { Alert, AlertDescription, AlertTitle } from '#/ui/components/ui/alert.tsx'

/** Explain why pairing sent the user to sign-in. */
export function PairingSignInNotice() {
  return (
    <Alert>
      <ShieldCheckIcon />
      <AlertTitle>Sign in to pair this Mac</AlertTitle>
      <AlertDescription>Your pairing link stays active after sign-in.</AlertDescription>
    </Alert>
  )
}
