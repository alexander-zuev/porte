import type { TurnstileInstance } from '@marsidev/react-turnstile'
import { useMutation } from '@tanstack/react-query'
import { authService } from '@web/lib/auth/auth-service.ts'
import type { SocialProvider } from '@web/lib/auth/social-provider.ts'
import { toast } from '@web/ui/components/ui/sonner.tsx'
import { useRef, useState, type RefObject } from 'react'

type OAuthVariables = {
  readonly provider: SocialProvider
  readonly captchaToken: string
}

export type SocialSignIn = {
  /** The provider being verified or redirected to, so its button can lock. */
  readonly pendingProvider: SocialProvider | undefined
  /** The page mounts the widget; the hook drives it. */
  readonly turnstileRef: RefObject<TurnstileInstance | null>
  readonly signIn: (provider: SocialProvider) => void
}

const FALLBACK_DETAIL = 'Try again in a moment.'

/** Keep the detail line useful: many auth errors carry the title as their message. */
function signInFailureDetail(cause: unknown): string {
  if (!(cause instanceof Error)) return FALLBACK_DETAIL
  const message = cause.message.trim()
  if (message.length === 0) return FALLBACK_DETAIL
  return message.toLowerCase() === 'sign-in failed' ? FALLBACK_DETAIL : message
}

/** Verify with Turnstile, then start the OAuth redirect to `redirectTo`. */
export function useSocialSignIn(redirectTo: string): SocialSignIn {
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

  async function verifyThenSignIn(provider: SocialProvider) {
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

  return {
    pendingProvider: oauth.isPending ? oauth.variables.provider : verifyingProvider,
    turnstileRef,
    signIn: (provider) => {
      void verifyThenSignIn(provider)
    },
  }
}
