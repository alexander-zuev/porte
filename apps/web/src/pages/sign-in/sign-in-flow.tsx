import { useSocialSignIn } from '@web/features/auth/hooks/use-social-sign-in.ts'
import { TurnstileWidget } from '@web/ui/components/security/turnstile-widget.tsx'

import { SignInPage } from './sign-in-page.tsx'

/** Props controlling where OAuth returns after authentication. */
export type SignInFlowProps = {
  readonly redirectTo: string
  readonly notice?: React.ReactNode
  /** The provider this browser signed in with last, read from the Better Auth cookie. */
  readonly lastMethod?: string | null
}

/** Run the social sign-in interaction and preserve its validated destination. */
export function SignInFlow({ redirectTo, notice, lastMethod }: SignInFlowProps) {
  const { pendingProvider, turnstileRef, signIn } = useSocialSignIn(redirectTo)

  return (
    <SignInPage
      lastMethod={lastMethod}
      notice={notice}
      pendingProvider={pendingProvider}
      onSocial={signIn}
    >
      <TurnstileWidget ref={turnstileRef} />
    </SignInPage>
  )
}
