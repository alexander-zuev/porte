import type { BetterAuthOptions } from 'better-auth'
import { captcha } from 'better-auth/plugins'

export type AuthRuntimeConfig = {
  readonly secret: string
  readonly baseURL: string
  readonly googleClientId: string
  readonly googleClientSecret: string
  readonly appleClientId: string
  readonly appleClientSecret: string
  readonly githubClientId: string
  readonly githubClientSecret: string
  readonly twitterClientId: string
  readonly twitterClientSecret: string
  readonly turnstileSecretKey: string
}

const DEV_ORIGINS = ['http://localhost:3000']

/**
 * Shared Better Auth options for the Worker and `better-auth-generate`.
 *
 * Omit `config` in CLI mode so schema generation does not need Worker bindings.
 */
export function createBetterAuthOptions(
  database: NonNullable<BetterAuthOptions['database']>,
  config?: AuthRuntimeConfig,
  additionalPlugins?: BetterAuthOptions['plugins'],
): BetterAuthOptions {
  return {
    appName: 'Porte',
    secret: config?.secret,
    baseURL: config?.baseURL,
    basePath: '/api/auth',
    database,
    emailAndPassword: {
      enabled: false,
    },
    socialProviders: {
      google: {
        clientId: config?.googleClientId ?? '',
        clientSecret: config?.googleClientSecret ?? '',
      },
      apple: {
        clientId: config?.appleClientId ?? '',
        clientSecret: config?.appleClientSecret ?? '',
      },
      github: {
        clientId: config?.githubClientId ?? '',
        clientSecret: config?.githubClientSecret ?? '',
      },
      twitter: {
        clientId: config?.twitterClientId ?? '',
        clientSecret: config?.twitterClientSecret ?? '',
      },
    },
    trustedOrigins: config ? [config.baseURL] : DEV_ORIGINS,
    advanced: {
      ipAddress: {
        ipAddressHeaders: ['cf-connecting-ip', 'x-forwarded-for'],
      },
    },
    plugins: [
      captcha({
        provider: 'cloudflare-turnstile',
        secretKey: config?.turnstileSecretKey ?? '',
        endpoints: ['/sign-in/social'],
      }),
      ...(additionalPlugins ?? []),
    ],
  }
}
