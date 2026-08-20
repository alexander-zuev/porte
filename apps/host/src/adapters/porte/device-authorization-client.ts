import {
  DEVICE_CODE_GRANT_TYPE,
  DeviceCodeResponseSchema,
  DeviceTokenErrorSchema,
  DeviceTokenResponseSchema,
  PAIRING_CODE_PATH,
  PORTE_CLI_CLIENT_ID,
} from '@porte/core'
import { Result, type Result as ResultType } from 'better-result'

import { PairingError } from '../../application/pairing-error.ts'
import type {
  DeviceAuthorizer,
  DeviceCodeGrant,
  DevicePollResult,
} from '../../application/ports/device-authorizer.ts'

/** The token exchange stays the plugin's own endpoint, under its base path. */
const DEVICE_TOKEN_PATH = '/api/auth/device/token'

/**
 * The device authorization grant over HTTP.
 *
 * Wire names stay snake_case until they leave this file, so the RFC and the
 * request bodies can be compared line for line.
 */
export class DeviceAuthorizationClient implements DeviceAuthorizer {
  constructor(private readonly baseUrl: string) {}

  async requestCode(): Promise<ResultType<DeviceCodeGrant, PairingError>> {
    const posted = await this.post(PAIRING_CODE_PATH, { client_id: PORTE_CLI_CLIENT_ID })
    if (posted.isErr()) return Result.err(posted.error)

    const parsed = DeviceCodeResponseSchema.safeParse(posted.value.body)
    if (!parsed.success) {
      return Result.err(new PairingError({ reason: 'unexpected', cause: parsed.error }))
    }

    return Result.ok({
      deviceCode: parsed.data.device_code,
      userCode: parsed.data.user_code,
      verificationUri: parsed.data.verification_uri,
      intervalSeconds: parsed.data.interval,
      expiresInSeconds: parsed.data.expires_in,
    })
  }

  /**
   * Ask once whether the person has approved yet.
   *
   * A pending or slow-down answer arrives with a non-2xx status, so status
   * alone cannot decide this; the body is what separates waiting from failing.
   */
  async poll(deviceCode: string): Promise<ResultType<DevicePollResult, PairingError>> {
    const posted = await this.post(DEVICE_TOKEN_PATH, {
      grant_type: DEVICE_CODE_GRANT_TYPE,
      device_code: deviceCode,
      client_id: PORTE_CLI_CLIENT_ID,
    })
    if (posted.isErr()) return Result.err(posted.error)

    const granted = DeviceTokenResponseSchema.safeParse(posted.value.body)
    if (granted.success) return Result.ok({ status: 'granted', token: granted.data.access_token })

    const failed = DeviceTokenErrorSchema.safeParse(posted.value.body)
    if (!failed.success) {
      return Result.err(new PairingError({ reason: 'unexpected', cause: posted.value.body }))
    }

    switch (failed.data.error) {
      case 'authorization_pending':
        return Result.ok({ status: 'pending' })
      case 'slow_down':
        // RFC 8628 says add five seconds each time the server says this.
        return Result.ok({ status: 'slow-down', intervalSeconds: 5 })
      case 'access_denied':
        return Result.err(new PairingError({ reason: 'denied' }))
      case 'expired_token':
        return Result.err(new PairingError({ reason: 'expired' }))
      default:
        return Result.err(new PairingError({ reason: 'unexpected', cause: failed.data.error }))
    }
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

  /** One JSON round trip. Transport faults become `unreachable`, never a throw. */
  private async post(
    path: string,
    body: Record<string, string>,
  ): Promise<ResultType<{ body: unknown }, PairingError>> {
    try {
      const response = await fetch(new URL(path, this.baseUrl), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      return Result.ok({ body: await response.json() })
    } catch (cause) {
      return Result.err(new PairingError({ reason: 'unreachable', cause }))
    }
  }
}
