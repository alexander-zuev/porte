import type { SocialProvider } from '#/lib/auth/social-provider.ts'
import { Logo } from '#/ui/components/logo.tsx'

import { SocialSignInButtons } from './social-sign-in-buttons.tsx'

/** Presentational sign-in column used by the dedicated sign-in page. */
export type SignInFormProps = {
  readonly pendingProvider: SocialProvider | undefined
  readonly error: string | undefined
  readonly notice?: React.ReactNode
  readonly children?: React.ReactNode
  readonly onSocial: (provider: SocialProvider) => void
}

/** Centered sign-in copy and provider buttons. */
export function SignInForm({
  pendingProvider,
  error,
  notice,
  children,
  onSocial,
}: SignInFormProps) {
  return (
    <div className="flex flex-col items-center gap-8 text-center">
      <Logo />
      {notice}
      <header className="flex flex-col gap-2">
        <h1>Sign in</h1>
        <p className="text-muted-foreground">Porte account, not Grok</p>
      </header>
      <SocialSignInButtons pendingProvider={pendingProvider} onSocial={onSocial} />
      {children}
      {error ? (
        <p className="text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
