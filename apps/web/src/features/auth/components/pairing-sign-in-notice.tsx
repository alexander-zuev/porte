import { ShieldCheckIcon } from '@phosphor-icons/react'
import { Alert, AlertDescription, AlertTitle } from '@web/ui/components/ui/alert.tsx'
import { useEffect } from 'react'
import { toast } from 'sonner'

/**
 * Explain why pairing sent the person here.
 *
 * The banner carries the reason; the toast carries the instruction, because
 * arriving at a sign-in form you did not ask for reads as an error until
 * something says otherwise.
 */
export function PairingSignInNotice() {
  useEffect(() => {
    // Keyed, so returning here twice does not stack two of the same message.
    toast('Sign in first to finish pairing', { id: 'pairing-sign-in' })
  }, [])

  return (
    <Alert>
      <ShieldCheckIcon />
      <AlertTitle>Sign in to connect your machine</AlertTitle>
      <AlertDescription>
        Pairing links this machine to your account, so you can drive its Grok sessions from your
        phone. Your code is still waiting.
      </AlertDescription>
    </Alert>
  )
}
