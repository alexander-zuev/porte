import { createPrivateKey, sign as signJwt } from 'node:crypto'

import { createLogger } from '@porte/core'

/**
 * Apple's client secret, which is not a secret at all but a signed assertion.
 *
 * Every other provider hands out a fixed string. Apple instead expects a short
 * ES256 JWT that the relying party signs with its own key, so the value has to
 * be produced per request rather than read from configuration.
 *
 * Apple-specific on purpose: the claim names, the audience, and the six-month
 * cap are Apple's rules, not a general way to sign a token.
 */

const logger = createLogger('apple-client-secret')

/** Apple posts its callback from here, so this origin must also be trusted. */
export const APPLE_ORIGIN = 'https://appleid.apple.com'

/** Apple rejects a client secret that lives longer than six months. */
const SECRET_TTL_SECONDS = 180 * 24 * 60 * 60

/** What signing needs. The Services ID acts as the client id. */
export type AppleKeyConfig = {
  readonly appleClientId: string
  readonly appleTeamId: string
  readonly appleKeyId: string
  readonly applePrivateKey: string
}

type JwtHeader = { readonly alg: 'ES256'; readonly kid: string }

type JwtPayload = {
  readonly iss: string
  readonly sub: string
  readonly aud: string
  readonly iat: number
  readonly exp: number
}

let keyFailureLogged = false

/**
 * Sign one Apple client secret.
 *
 * Returns an empty string when Apple is unconfigured or the key does not parse.
 * A bad key then disables Apple sign-in rather than breaking construction of
 * the auth instance, which every request depends on.
 */
export function generateAppleClientSecret(config?: AppleKeyConfig): string {
  if (!config?.appleClientId || !config.appleTeamId || !config.appleKeyId) return ''

  // Wrangler and dotenvx both round-trip the PEM with escaped newlines.
  const privateKey = config.applePrivateKey.replace(/\\n/g, '\n')
  try {
    createPrivateKey(privateKey)
  } catch (error) {
    // Logged once per isolate: this runs on every auth instance construction.
    if (!keyFailureLogged) {
      keyFailureLogged = true
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
      exp: issuedAt + SECRET_TTL_SECONDS,
    }),
  ].join('.')

  return `${input}.${toBase64Url(signature(input, privateKey))}`
}

/** JWT uses base64url, which differs from base64 in three characters. */
function toBase64Url(value: JwtHeader | JwtPayload | Buffer): string {
  const raw = Buffer.isBuffer(value) ? value : Buffer.from(JSON.stringify(value))
  return raw.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

/** ES256 wants a raw r||s pair, which is what ieee-p1363 produces. */
function signature(input: string, privateKey: string): Buffer {
  return Buffer.from(
    signJwt('sha256', Buffer.from(input), { key: privateKey, dsaEncoding: 'ieee-p1363' }),
  )
}
