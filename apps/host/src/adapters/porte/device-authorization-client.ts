import { createFetch, createSchema } from '@better-fetch/fetch'
import { PairingError } from '@host/application/pairing-error.ts'
import type {
  DeviceAuthorizer,
  DeviceCodeGrant,
  DevicePollResult,
} from '@host/application/ports/device-authorizer.ts'
import {
  DEVICE_CODE_GRANT_TYPE,
  DeviceCodeRequestSchema,
  DeviceCodeResponseSchema,
  DeviceTokenErrorSchema,
  DeviceTokenRequestSchema,
  DeviceTokenResponseSchema,
  PAIRING_CODE_PATH,
  PORTE_CLI_CLIENT_ID,
  ProblemDetailsSchema,
  type DeviceTokenError,
  type HostDescriptor,
} from '@porte/core/client'
import { Result, type Result as ResultType } from 'better-result'
import { z } from 'zod'

/** The token exchange stays the plugin's own endpoint, under its base path. */
const DEVICE_TOKEN_PATH = '/api/auth/device/token'
/** Better Auth's own route. The grant never says who approved. */
const SESSION_PATH = '/api/auth/get-session'

const sessionAccountSchema = z.object({
  user: z.object({ email: z.email().nullish(), name: z.string().nullish() }),
})

/**
 * The two calls the grant is made of, and the shapes each side may send.
 *
 * Declaring them once means a response is validated before it is a value, so
 * nothing below this file has to ask whether a field arrived.
 */
const grantSchema = createSchema({
  [`@post${PAIRING_CODE_PATH}`]: {
    input: DeviceCodeRequestSchema,
    output: DeviceCodeResponseSchema,
  },
  [`@post${DEVICE_TOKEN_PATH}`]: {
    input: DeviceTokenRequestSchema,
    output: DeviceTokenResponseSchema,
  },
})

/**
 * The device authorization grant over HTTP.
 *
 * Wire names stay snake_case until they leave this file, so the RFC and the
 * request bodies can be compared line for line.
 */
export class DeviceAuthorizationClient implements DeviceAuthorizer {
  private readonly fetch: ReturnType<typeof createFetch>

  constructor(private readonly baseUrl: string) {
    // Errors come back as values, so a refusal never unwinds the poll loop.
    this.fetch = createFetch({ baseURL: baseUrl, schema: grantSchema, throw: false })
  }

  async requestCode(host: HostDescriptor): Promise<ResultType<DeviceCodeGrant, PairingError>> {
    const { data, error } = await this.fetch(`@post${PAIRING_CODE_PATH}`, {
      body: {
        client_id: PORTE_CLI_CLIENT_ID,
        host_name: host.name,
        host_platform: host.platform,
      },
      errorSchema: ProblemDetailsSchema,
      output: DeviceCodeResponseSchema,
    })
    if (error) return Result.err(transportError(error))

    return Result.ok({
      deviceCode: data.device_code,
      userCode: data.user_code,
      verificationUri: data.verification_uri,
      intervalSeconds: data.interval,
      expiresInSeconds: data.expires_in,
    })
  }

  /**
   * Ask once whether the person has approved yet.
   *
   * Pending and slow-down arrive as non-2xx, so the status alone cannot decide
   * this. The refusal code in the body is what separates waiting from failing.
   */
  async poll(deviceCode: string): Promise<ResultType<DevicePollResult, PairingError>> {
    const { data, error } = await this.fetch(`@post${DEVICE_TOKEN_PATH}`, {
      body: {
        grant_type: DEVICE_CODE_GRANT_TYPE,
        device_code: deviceCode,
        client_id: PORTE_CLI_CLIENT_ID,
      },
      output: DeviceTokenResponseSchema,
    })
    if (data) return Result.ok({ status: 'granted', token: data.access_token })

    const refusal = DeviceTokenErrorSchema.safeParse(error)
    if (!refusal.success) return Result.err(transportError(error))

    return fromRefusal(refusal.data.error)
  }

  /**
   * End the pairing.
   *
   * Stubbed: the route it needs does not exist yet, so unpairing currently only
   * clears the local credential. Wiring the request is a change to this method.
   */
  revoke(_token: string): Promise<ResultType<void, PairingError>> {
    return Promise.resolve(Result.ok())
  }

  /**
   * Ask who the new token belongs to.
   *
   * Better Auth's own route rather than the grant's, so it stays outside the
   * schema above. Outside `Result` too: a name is a courtesy, and pairing has
   * already succeeded by the time anyone asks for it.
   */
  async accountOf(token: string): Promise<string | null> {
    try {
      const response = await fetch(new URL(SESSION_PATH, this.baseUrl), {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!response.ok) return null

      const parsed = sessionAccountSchema.safeParse(await response.json())
      if (!parsed.success) return null

      return parsed.data.user.email ?? parsed.data.user.name ?? null
    } catch {
      return null
    }
  }
}

/** What the grant's own vocabulary means to the person who ran `porte pair`. */
function fromRefusal(
  refusal: DeviceTokenError['error'],
): ResultType<DevicePollResult, PairingError> {
  switch (refusal) {
    case 'authorization_pending':
      return Result.ok({ status: 'pending' })
    case 'slow_down':
      // RFC 8628 says add five seconds each time the server says this.
      return Result.ok({ status: 'slow-down', intervalSeconds: 5 })
    // How pairing ends when the answer is no, or when nobody answers at all.
    case 'access_denied':
      return Result.ok({ status: 'denied' })
    case 'expired_token':
      return Result.ok({ status: 'expired' })
    default:
      return Result.err(new PairingError({ reason: 'unexpected', cause: refusal }))
  }
}

/** A zero status is better-fetch reporting it never reached the server. */
function transportError(error: { status: number }): PairingError {
  return new PairingError({
    reason: error.status === 0 ? 'unreachable' : 'unexpected',
    cause: error,
  })
}
