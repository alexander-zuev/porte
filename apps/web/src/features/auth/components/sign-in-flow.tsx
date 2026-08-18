import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'

import { authService } from '#/lib/auth/auth-service.ts'
import type { SocialProvider } from '#/lib/auth/social-provider.ts'
import { TurnstileWidget } from '#/ui/components/security/turnstile-widget.tsx'

import { SignInForm } from './sign-in-form.tsx'

export function SignInFlow() {
  const [captchaToken, setCaptchaToken] = useState('')
  const [error, setError] = useState<string>()

  const oauth = useMutation({
    mutationFn: (provider: SocialProvider) =>
      authService().signInWithOAuth(provider, {
        redirectTo: '/dashboard',
        captchaToken,
      }),
    onError: (cause) => {
      setCaptchaToken('')
      setError(cause instanceof Error ? cause.message : 'Sign-in failed.')
    },
  })

  return (
    <SignInForm
      captchaReady={captchaToken.length > 0}
      error={error}
      pendingProvider={oauth.isPending ? oauth.variables : undefined}
      onSocial={(provider) => {
        setError(undefined)
        oauth.mutate(provider)
      }}
    >
      <TurnstileWidget
        onTokenChange={(token) => {
          setCaptchaToken(token)
        }}
      />
    </SignInForm>
  )
}
