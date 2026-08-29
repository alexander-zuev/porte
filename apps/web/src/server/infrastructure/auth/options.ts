import { PAIRING_CODE_LENGTH, PAIRING_CODE_LIFETIME_SECONDS } from '@porte/core'
import type { FileRouteTypes } from '@web/lib/router/routeTree.gen.ts'
import type { BetterAuthOptions } from 'better-auth'
import { bearer, captcha, deviceAuthorization, lastLoginMethod } from 'better-auth/plugins'
import { v7 as uuidv7 } from 'uuid'

import { APPLE_ORIGIN, generateAppleClientSecret } from './apple-client-secret.ts'

export type AuthRuntimeConfig = {
  readonly secret: string
  readonly baseURL: string
  readonly googleClientId: string
  readonly googleClientSecret: string
  /** The Apple Services ID. Apple has no static secret, so three key fields follow. */
  readonly appleClientId: string
  readonly appleTeamId: string
  readonly appleKeyId: string
  readonly applePrivateKey: string
  readonly githubClientId: string
  readonly githubClientSecret: string
  readonly twitterClientId: string
  readonly twitterClientSecret: string
  readonly turnstileSecretKey: string
  /** Dev also trusts localhost, so either the tunnel or the local port works. */
  readonly isDevelopment: boolean
  /** Optional key-value store for sessions, so reads skip D1. */
  readonly secondaryStorage?: BetterAuthOptions['secondaryStorage']
  /** Counts requests per address and path. Absent in contexts with no binding. */
  readonly rateLimitStorage?: NonNullable<BetterAuthOptions['rateLimit']>['customStorage']
  /** Defers non-critical writes off the response path. */
  readonly waitUntil: (promise: Promise<unknown>) => void
}

const DEV_ORIGINS = ['http://localhost:3000']

/** The only OAuth client Porte authorizes. Nothing else may claim a device code. */
export const PORTE_CLI_CLIENT_ID = 'porte-cli'

/** The authority's own spelling of the lifetime core declares. */
const PAIRING_EXPIRES_IN = `${PAIRING_CODE_LIFETIME_SECONDS}s`
/** The CLI honours this between polls. Kept at the default so polling stays under the limiter. */
const PAIRING_POLL_INTERVAL = '5s'
/** Where the CLI sends the user. Typed, so renaming the route breaks the build. */
// The field, not the page that prints the command: whoever follows this link
// already ran it and is holding a code.
const PAIRING_PATH: FileRouteTypes['fullPaths'] = '/pair/code'

/** Session data rides in a signed cookie for this long before storage is consulted. */
const SESSION_COOKIE_CACHE = 5 * 60

/**
 * Advanced options, assembled in steps.
 *
 * `backgroundTasks` needs a live `waitUntil`, which CLI schema generation has
 * no way to supply, so the key is added only when a runtime config exists.
 */
function buildAdvanced(config?: AuthRuntimeConfig): BetterAuthOptions['advanced'] {
  const advanced: BetterAuthOptions['advanced'] = {
    ipAddress: { ipAddressHeaders: ['cf-connecting-ip', 'x-forwarded-for'] },
    // Time-ordered ids keep index inserts local and sort rows by creation.
    database: { generateId: () => uuidv7() },
  }
  if (config === undefined) return advanced
  // Session refresh and similar writes finish after the response is sent.
  return { ...advanced, backgroundTasks: { handler: config.waitUntil } }
}

/**
 * Device grant options, assembled in steps.
 *
 * The verification URI is where the CLI sends the user, so it has to follow the
 * base URL. CLI schema generation has no base URL, and omits the key entirely.
 */
function buildDeviceAuthorization(
  config?: AuthRuntimeConfig,
): NonNullable<Parameters<typeof deviceAuthorization>[0]> {
  const options = {
    expiresIn: PAIRING_EXPIRES_IN,
    interval: PAIRING_POLL_INTERVAL,
    userCodeLength: PAIRING_CODE_LENGTH,
    validateClient: (clientId: string) => clientId === PORTE_CLI_CLIENT_ID,
  } as const
  if (config === undefined) return options
  return { ...options, verificationUri: `${config.baseURL}${PAIRING_PATH}` }
}

/**
 * Shared Better Auth options for the Worker and `better-auth-generate`.
 *
 * Omit `config` in CLI mode so schema generation does not need Worker bindings.
 *
 * The return type is inferred, never annotated. `betterAuth` reads the plugin
 * list to type `auth.api`, so declaring `BetterAuthOptions` here would widen
 * the list and leave every plugin endpoint missing from the instance.
 */
export function createBetterAuthOptions(
  database: NonNullable<BetterAuthOptions['database']>,
  config?: AuthRuntimeConfig,
  additionalPlugins?: BetterAuthOptions['plugins'],
) {
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
        clientSecret: generateAppleClientSecret(config),
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
    trustedOrigins: config
      ? [config.baseURL, APPLE_ORIGIN, ...(config.isDevelopment ? DEV_ORIGINS : [])]
      : [APPLE_ORIGIN, ...DEV_ORIGINS],
    // Sessions live in KV, so an authenticated request never reads D1 for them.
    secondaryStorage: config?.secondaryStorage,

    session: {
      // expiresIn, updateAge, and freshAge keep their defaults of 7d, 1d, 1d.
      cookieCache: { enabled: true, maxAge: SESSION_COOKIE_CACHE },
    },

    // Off without a binding, rather than falling back to the in-memory counters
    // the default would use, which on Workers are per-isolate and bound nothing.
    rateLimit: config?.rateLimitStorage
      ? { enabled: true, customStorage: config.rateLimitStorage }
      : { enabled: false },

    advanced: buildAdvanced(config),
    plugins: [
      captcha({
        provider: 'cloudflare-turnstile',
        secretKey: config?.turnstileSecretKey ?? '',
        endpoints: ['/sign-in/social'],
        expectedAction: 'sign-in',
        allowedHostnames: config
          ? [
              new URL(config.baseURL).hostname,
              ...(config.isDevelopment ? ['localhost', '127.0.0.1'] : []),
            ]
          : undefined,
      }),
      // Cookie only. Nothing reads a stored column, so the user table stays as it is.
      lastLoginMethod(),
      // The machine daemon has no browser, so it earns a session through RFC 8628.
      deviceAuthorization(buildDeviceAuthorization(config)),
      // The daemon holds that session as a token, not a cookie.
      bearer(),
      ...(additionalPlugins ?? []),
    ],
  }
}
