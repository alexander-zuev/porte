import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile'
import type { Ref } from 'react'

import { settings } from '#/lib/env/settings.ts'

type TurnstileWidgetProps = {
  readonly onTokenChange: (token: string) => void
  readonly size?: 'normal' | 'compact' | 'flexible' | 'invisible'
  readonly ref?: Ref<TurnstileInstance | null>
}

export function TurnstileWidget({ onTokenChange, size = 'invisible', ref }: TurnstileWidgetProps) {
  return (
    <Turnstile
      ref={ref}
      siteKey={settings.turnstile.siteKey}
      options={{ size, theme: 'dark', action: 'sign-in' }}
      onSuccess={onTokenChange}
      onExpire={() => {
        onTokenChange('')
      }}
      onError={() => {
        onTokenChange('')
      }}
    />
  )
}
