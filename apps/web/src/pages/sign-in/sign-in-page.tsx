import { SocialSignInButtons } from '@web/features/auth/components/social-sign-in-buttons.tsx'
import type { SocialProvider } from '@web/lib/auth/social-provider.ts'
import { LogoLink } from '@web/ui/components/logo.tsx'
import type { ReactNode } from 'react'

export type SignInPageProps = {
  readonly pendingProvider: SocialProvider | undefined
  /** Context shown above the providers, such as a pending pairing request. */
  readonly notice?: ReactNode
  readonly children?: ReactNode
  /** The provider this browser signed in with last, read from the Better Auth cookie. */
  readonly lastMethod?: string | null
  readonly onSocial: (provider: SocialProvider) => void
}

/** Sign-in screen. Failures surface as a toast, so nothing here reserves space for them. */
export function SignInPage({
  pendingProvider,
  notice,
  children,
  lastMethod,
  onSocial,
}: SignInPageProps) {
  return (
    <>
      <LogoLink />
      {/* Why you are here comes before what to do about it. Wide enough for the
          pairing notice to read as sentences, not a column. */}
      {/* Capped from md only: on a phone the shell padding sets the edge, the same on every page. */}
      <div className="flex w-full flex-col gap-6 md:max-w-sm">
        {notice}
        <h1 className="text-center">Sign in to Porte</h1>
        <SocialSignInButtons
          lastMethod={lastMethod}
          pendingProvider={pendingProvider}
          onSocial={onSocial}
        />
        {children}
      </div>
    </>
  )
}
