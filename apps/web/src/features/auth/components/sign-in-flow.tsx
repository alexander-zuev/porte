import type { TurnstileInstance } from '@marsidev/react-turnstile'
import { useMutation } from '@tanstack/react-query'
import { useRef, useState } from 'react'

import { authService } from '#/lib/auth/auth-service.ts'
import type { SocialProvider } from '#/lib/auth/social-provider.ts'
import { SignInPage } from '#/pages/sign-in/sign-in-page.tsx'
import { TurnstileWidget } from '#/ui/components/security/turnstile-widget.tsx'
import { toast } from '#/ui/components/ui/sonner.tsx'

/** Props controlling where OAuth returns after authentication. */
export type SignInFlowProps = {
  readonly redirectTo: string
  readonly notice?: React.ReactNode
}

type OAuthVariables = {
  readonly provider: SocialProvider
  readonly captchaToken: string
}

const FALLBACK_DETAIL = 'Try again in a moment.'

/** Keep the detail line useful: many auth errors carry the title as their message. */
function signInFailureDetail(cause: unknown): string {
  if (!(cause instanceof Error)) return FALLBACK_DETAIL
  const message = cause.message.trim()
  if (message.length === 0) return FALLBACK_DETAIL
  return message.toLowerCase() === 'sign-in failed' ? FALLBACK_DETAIL : message
}

/** Run the social sign-in interaction and preserve its validated destination. */
export function SignInFlow({ redirectTo, notice }: SignInFlowProps) {
  const [verifyingProvider, setVerifyingProvider] = useState<SocialProvider>()
  const turnstileRef = useRef<TurnstileInstance | null>(null)

  const oauth = useMutation({
    mutationFn: ({ provider, captchaToken }: OAuthVariables) =>
      authService().signInWithOAuth(provider, { redirectTo, captchaToken }),
    onError: (cause) => {
      turnstileRef.current?.reset()
      toast.error('Sign-in failed', { description: signInFailureDetail(cause) })
    },
    onSettled: () => {
      setVerifyingProvider(undefined)
    },
  })

  async function signIn(provider: SocialProvider) {
    const widget = turnstileRef.current
    if (widget === null) {
      toast.error('Verification unavailable', {
        description: 'Reload the page and try again.',
      })
      return
    }

    setVerifyingProvider(provider)
    try {
      widget.reset()
      widget.execute()
      const captchaToken = await widget.getResponsePromise()
      oauth.mutate({ provider, captchaToken })
    } catch {
      setVerifyingProvider(undefined)
      toast.error('Verification failed', { description: 'Try again in a moment.' })
    }
  }

  return (
    <SignInPage
      notice={notice}
      pendingProvider={oauth.isPending ? oauth.variables.provider : verifyingProvider}
      onSocial={(provider) => {
        void signIn(provider)
      }}
    >
      <TurnstileWidget ref={turnstileRef} />
    </SignInPage>
  )
}
