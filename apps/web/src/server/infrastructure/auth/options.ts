import { createPrivateKey, sign as signJwt } from 'node:crypto'

import { createLogger } from '@porte/core'
import type { BetterAuthOptions } from 'better-auth'
import { bearer, captcha, deviceAuthorization } from 'better-auth/plugins'
import { v7 as uuidv7 } from 'uuid'

import type { FileRouteTypes } from '#/lib/router/routeTree.gen.ts'

const logger = createLogger('auth-options')

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
  /** Defers non-critical writes off the response path. */
  readonly waitUntil: (promise: Promise<unknown>) => void
}

const DEV_ORIGINS = ['http://localhost:3000']

/** Apple posts the callback from its own origin, so that origin must be trusted. */
const APPLE_ORIGIN = 'https://appleid.apple.com'

/** Apple rejects a client secret that lives longer than six months. */
const APPLE_SECRET_TTL = 180 * 24 * 60 * 60

type AppleKeyConfig = Pick<
  AuthRuntimeConfig,
  'appleClientId' | 'appleTeamId' | 'appleKeyId' | 'applePrivateKey'
>

type AppleJwtHeader = { readonly alg: 'ES256'; readonly kid: string }

type AppleJwtPayload = {
  readonly iss: string
  readonly sub: string
  readonly aud: string
  readonly iat: number
  readonly exp: number
}

function toBase64Url(value: AppleJwtHeader | AppleJwtPayload) {
  return Buffer.from(JSON.stringify(value))
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

let appleKeyFailureLogged = false

/**
 * Sign the Apple client secret, which is an ES256 JWT rather than a fixed string.
 *
 * Returns an empty string when Apple is unconfigured or the key does not parse,
 * so a bad key disables Apple sign-in instead of breaking every session check.
 */
export function generateAppleClientSecret(config?: AppleKeyConfig) {
  if (!config?.appleClientId || !config.appleTeamId || !config.appleKeyId) return ''

  // Wrangler and dotenvx both round-trip the PEM with escaped newlines.
  const privateKey = config.applePrivateKey.replace(/\\n/g, '\n')
  try {
    createPrivateKey(privateKey)
  } catch (error) {
    // Logged once per isolate: this runs on every auth instance construction.
    if (!appleKeyFailureLogged) {
      appleKeyFailureLogged = true
      logger.error('apple_private_key_invalid', { error, details: { keyId: config.appleKeyId } })
    }
    return ''
  }

  const issuedAt = Math.floor(Date.now() / 1000)
  const input = [
    toBase64Url({ alg: 'ES256', kid: config.appleKeyId }),
    toBase64Url({
      iss: config.appleTeamId,
      sub: config.appleClientId,
      aud: APPLE_ORIGIN,
      iat: issuedAt,
      exp: issuedAt + APPLE_SECRET_TTL,
    }),
  ].join('.')

  const signature = Buffer.from(
    signJwt('sha256', Buffer.from(input), { key: privateKey, dsaEncoding: 'ieee-p1363' }),
  )
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')

  return `${input}.${signature}`
}

/** The only OAuth client Porte authorizes. Nothing else may claim a device code. */
export const PORTE_CLI_CLIENT_ID = 'porte-cli'

/** Long enough to walk to a phone and sign in, short enough that a seen code dies. */
const PAIRING_EXPIRES_IN = '10m'
/** The CLI honours this between polls. Shorter than the 5s default for a snappier pair. */
const PAIRING_POLL_INTERVAL = '3s'
/** Must match the OTP slot count in the pairing form. */
const PAIRING_CODE_LENGTH = 6
/** Where the CLI sends the user. Typed, so renaming the route breaks the build. */
const PAIRING_PATH: FileRouteTypes['fullPaths'] = '/pair'

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

    advanced: buildAdvanced(config),
    plugins: [
      captcha({
        provider: 'cloudflare-turnstile',
        secretKey: config?.turnstileSecretKey ?? '',
        endpoints: ['/sign-in/social'],
      }),
      // The Mac daemon has no browser, so it earns a session through RFC 8628.
      deviceAuthorization(buildDeviceAuthorization(config)),
      // The daemon holds that session as a token, not a cookie.
      bearer(),
      ...(additionalPlugins ?? []),
    ],
  }
}
