import {
  AppleLogoIcon,
  GithubLogoIcon,
  GoogleLogoIcon,
  SpinnerGapIcon,
  XLogoIcon,
} from '@phosphor-icons/react'
import type { ComponentType } from 'react'

import type { SocialProvider } from '#/lib/auth/social-provider.ts'
import { Button } from '#/ui/components/ui/button.tsx'

const PROVIDERS: {
  readonly provider: SocialProvider
  readonly label: string
  readonly Icon: ComponentType<{ className?: string }>
}[] = [
  { provider: 'google', label: 'Continue with Google', Icon: GoogleLogoIcon },
  { provider: 'apple', label: 'Continue with Apple', Icon: AppleLogoIcon },
  { provider: 'github', label: 'Continue with GitHub', Icon: GithubLogoIcon },
  { provider: 'twitter', label: 'Continue with X', Icon: XLogoIcon },
]

/** Props for the social sign-in provider list. */
export type SocialSignInButtonsProps = {
  readonly pendingProvider: SocialProvider | undefined
  readonly onSocial: (provider: SocialProvider) => void
}

/** Render Google, Apple, GitHub, and X as full-width sign-in actions. */
export function SocialSignInButtons({ pendingProvider, onSocial }: SocialSignInButtonsProps) {
  const pending = pendingProvider !== undefined

  return (
    <div className="flex w-full flex-col gap-3">
      {PROVIDERS.map(({ provider, label, Icon }) => (
        <Button
          key={provider}
          className="w-full"
          disabled={pending}
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
  )
}
