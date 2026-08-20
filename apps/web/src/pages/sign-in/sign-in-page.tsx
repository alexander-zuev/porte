import type { ReactNode } from 'react'

import { SignInLayout } from '#/features/auth/components/sign-in-layout.tsx'
import { SocialSignInButtons } from '#/features/auth/components/social-sign-in-buttons.tsx'
import type { SocialProvider } from '#/lib/auth/social-provider.ts'

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
    <SignInLayout>
      {/* Why you are here comes before what to do about it. */}
      <div className="flex flex-col gap-6">
        {notice}
        <h1 className="text-center">Sign in to Porte</h1>
        <SocialSignInButtons
          lastMethod={lastMethod}
          pendingProvider={pendingProvider}
          onSocial={onSocial}
        />
        {children}
      </div>
    </SignInLayout>
  )
}
