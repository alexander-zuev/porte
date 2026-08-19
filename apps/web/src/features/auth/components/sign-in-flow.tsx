import type { TurnstileInstance } from '@marsidev/react-turnstile'
import { useMutation } from '@tanstack/react-query'
import { useRef, useState } from 'react'

import { authService } from '#/lib/auth/auth-service.ts'
import type { SocialProvider } from '#/lib/auth/social-provider.ts'
import { TurnstileWidget } from '#/ui/components/security/turnstile-widget.tsx'

import { SignInForm } from './sign-in-form.tsx'

/** Props controlling where OAuth returns after authentication. */
export type SignInFlowProps = {
  readonly redirectTo: string
  readonly notice?: React.ReactNode
}

type OAuthVariables = {
  readonly provider: SocialProvider
  readonly captchaToken: string
}

/** Run the social sign-in interaction and preserve its validated destination. */
export function SignInFlow({ redirectTo, notice }: SignInFlowProps) {
  const [error, setError] = useState<string>()
  const [verifyingProvider, setVerifyingProvider] = useState<SocialProvider>()
  const turnstileRef = useRef<TurnstileInstance | null>(null)

  const oauth = useMutation({
    mutationFn: ({ provider, captchaToken }: OAuthVariables) =>
      authService().signInWithOAuth(provider, { redirectTo, captchaToken }),
    onError: (cause) => {
      turnstileRef.current?.reset()
      setError(cause instanceof Error ? cause.message : 'Sign-in failed')
    },
    onSettled: () => {
      setVerifyingProvider(undefined)
    },
  })

  async function signIn(provider: SocialProvider) {
    const widget = turnstileRef.current
    if (widget === null) {
      setError('Verification unavailable')
      return
    }

    setError(undefined)
    setVerifyingProvider(provider)
    try {
      widget.reset()
      widget.execute()
      const captchaToken = await widget.getResponsePromise()
      oauth.mutate({ provider, captchaToken })
    } catch {
      setVerifyingProvider(undefined)
      setError('Verification failed. Try again')
    }
  }

  return (
    <SignInForm
      error={error}
      notice={notice}
      pendingProvider={oauth.isPending ? oauth.variables.provider : verifyingProvider}
      onSocial={(provider) => {
        void signIn(provider)
      }}
    >
      <TurnstileWidget ref={turnstileRef} />
    </SignInForm>
  )
}
