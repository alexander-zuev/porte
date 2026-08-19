import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile'
import type { Ref } from 'react'

import { settings } from '#/lib/env/env.ts'

type TurnstileWidgetProps = {
  readonly size?: 'normal' | 'compact' | 'flexible' | 'invisible'
  readonly ref?: Ref<TurnstileInstance | null>
}

/** Invisible Turnstile. Call `reset()` then `execute()` from the submit path to mint a token. */
export function TurnstileWidget({ size = 'invisible', ref }: TurnstileWidgetProps) {
  return (
    <Turnstile
      ref={ref}
      siteKey={settings.turnstile.siteKey}
      options={{
        size,
        theme: 'dark',
        action: 'sign-in',
        execution: 'execute',
        appearance: 'interaction-only',
      }}
    />
  )
}
