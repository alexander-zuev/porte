import {
  AppleLogoIcon,
  GithubLogoIcon,
  GoogleLogoIcon,
  SpinnerGapIcon,
  XLogoIcon,
} from '@phosphor-icons/react'
import type { SocialProvider } from '@web/lib/auth/social-provider.ts'
import { Badge } from '@web/ui/components/ui/badge.tsx'
import { Button } from '@web/ui/components/ui/button.tsx'
import type { ComponentType } from 'react'

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
  /** The provider this browser signed in with last, read from the Better Auth cookie. */
  readonly lastMethod?: string | null
  readonly onSocial: (provider: SocialProvider) => void
}

/** Render Google, Apple, GitHub, and X as full-width sign-in actions. */
export function SocialSignInButtons({
  pendingProvider,
  lastMethod,
  onSocial,
}: SocialSignInButtonsProps) {
  const pending = pendingProvider !== undefined

  return (
    <div className="flex w-full flex-col gap-3">
      {PROVIDERS.map(({ provider, label, Icon }) => (
        <div key={provider} className="relative">
          <Button
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
          {/* Astride the top border, flush inside the right one: overhanging it
              puts half the badge past a 320px screen. */}
          {lastMethod === provider && (
            <Badge
              className="pointer-events-none absolute top-0 right-0 -translate-y-1/2 animate-in duration-200 fade-in"
              variant="neutral"
            >
              Last used
            </Badge>
          )}
        </div>
      ))}
    </div>
  )
}
