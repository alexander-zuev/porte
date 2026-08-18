import { GithubLogoIcon, SpinnerGapIcon, TriangleIcon, XLogoIcon } from '@phosphor-icons/react'
import type { ComponentType } from 'react'

import type { SocialProvider } from '#/lib/auth/social-provider.ts'
import { Button } from '#/ui/components/ui/button.tsx'

const PROVIDERS: {
  readonly provider: SocialProvider
  readonly label: string
  readonly Icon: ComponentType<{ className?: string }>
}[] = [
  { provider: 'github', label: 'Continue with GitHub', Icon: GithubLogoIcon },
  { provider: 'twitter', label: 'Continue with X', Icon: XLogoIcon },
  { provider: 'vercel', label: 'Continue with Vercel', Icon: TriangleIcon },
]

export type SignInFormProps = {
  readonly pendingProvider: SocialProvider | undefined
  readonly captchaReady: boolean
  readonly error: string | undefined
  readonly children?: React.ReactNode
  readonly onSocial: (provider: SocialProvider) => void
}

export function SignInForm({
  pendingProvider,
  captchaReady,
  error,
  children,
  onSocial,
}: SignInFormProps) {
  const pending = pendingProvider !== undefined

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <small className="text-muted-foreground">Porte</small>
        <h1>Sign in</h1>
        <p className="text-muted-foreground">Use your app account. This is not your Grok login.</p>
      </header>
      <div className="flex flex-col gap-3">
        {PROVIDERS.map(({ provider, label, Icon }) => (
          <Button
            key={provider}
            disabled={pending || !captchaReady}
            type="button"
            variant="outline"
            onClick={() => {
              onSocial(provider)
            }}
          >
            {pendingProvider === provider ? (
              <SpinnerGapIcon className="animate-spin" data-icon="inline-start" />
            ) : (
              <Icon data-icon="inline-start" />
            )}
            {label}
          </Button>
        ))}
      </div>
      {children}
      {error ? (
        <p className="text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
