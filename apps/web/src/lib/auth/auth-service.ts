import { createLogger } from '@porte/core'
import { createClientOnlyFn } from '@tanstack/react-start'

import type { SocialProvider } from '#/lib/auth/social-provider.ts'
import { authClient } from '#/lib/clients/auth.client.ts'

const logger = createLogger('auth-service')

class OAuthSignInError extends Error {
  readonly code = 'OAUTH_SIGN_IN_FAILED' as const

  constructor(readonly cause: unknown) {
    super('Sign-in failed', { cause })
  }
}

function captchaHeaders(captchaToken: string) {
  return { headers: { 'x-captcha-response': captchaToken } }
}

const signInWithOAuth = createClientOnlyFn(
  async (provider: SocialProvider, options: { redirectTo: string; captchaToken: string }) => {
    const { error } = await authClient.signIn.social({
      provider,
      callbackURL: options.redirectTo,
      fetchOptions: captchaHeaders(options.captchaToken),
    })
    if (error) {
      throw new OAuthSignInError(error)
    }
    logger.info('oauth_sign_in_initiated', { provider })
  },
)

/** Provide browser authentication operations. */
export function authService() {
  return { signInWithOAuth }
}
