import { z } from 'zod'

/**
 * The device authorization grant, shared by the daemon and the Worker.
 *
 * These are wire names from RFC 8628, so they stay snake_case here and are
 * renamed only once each side has parsed them.
 */

/** The only OAuth client Porte authorizes. Nothing else may claim a device code. */
export const PORTE_CLI_CLIENT_ID = 'porte-cli'

/**
 * Where a device asks Porte for a code.
 *
 * Porte's own route rather than the plugin's, so issuing a code and recording
 * where it came from happen together. Shared so the daemon and the route that
 * serves it cannot drift; the route asserts it against the generated tree.
 */
export const PAIRING_CODE_PATH = '/api/pair/code' as const

/** RFC 8628 fixes this value; the token request is invalid without it. */
export const DEVICE_CODE_GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:device_code'

/** What a device sends to ask for a code. RFC 8628 names the field. */
export const DeviceCodeRequestSchema = z.object({
  client_id: z.string().min(1),
})
export type DeviceCodeRequest = z.infer<typeof DeviceCodeRequestSchema>

/** What a device sends to exchange an approved code for a session. */
export const DeviceTokenRequestSchema = z.object({
  grant_type: z.literal(DEVICE_CODE_GRANT_TYPE),
  device_code: z.string().min(1),
  client_id: z.string().min(1),
})
export type DeviceTokenRequest = z.infer<typeof DeviceTokenRequestSchema>

export const DeviceCodeResponseSchema = z.object({
  device_code: z.string().min(1),
  user_code: z.string().min(1),
  verification_uri: z.string().min(1),
  verification_uri_complete: z.string().min(1),
  expires_in: z.number().int().positive(),
  interval: z.number().int().positive(),
})
export type DeviceCodeResponse = z.infer<typeof DeviceCodeResponseSchema>

export const DeviceTokenResponseSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.string().min(1),
})
export type DeviceTokenResponse = z.infer<typeof DeviceTokenResponseSchema>

/**
 * The error codes a token poll can answer with.
 *
 * `authorization_pending` and `slow_down` are the ordinary path, not faults:
 * the daemon polls a live code many times before anyone approves it.
 */
export const DeviceTokenErrorSchema = z.object({
  error: z.enum([
    'authorization_pending',
    'slow_down',
    'access_denied',
    'expired_token',
    'invalid_grant',
  ]),
})
export type DeviceTokenError = z.infer<typeof DeviceTokenErrorSchema>

/**
 * How the browser-facing endpoints report a refusal.
 *
 * Every code `/device`, `/device/approve`, and `/device/deny` can send. Only
 * the code is listed: the `error_description` beside it on the wire is prose
 * for a person, and deciding from it would tie a branch to the wording. A code
 * outside this set does not parse, so it stays an error rather than being
 * silently read as one of these.
 */
export const DeviceDecisionErrorSchema = z.object({
  error: z.enum(['invalid_request', 'expired_token', 'access_denied', 'unauthorized']),
})
export type DeviceDecisionError = z.infer<typeof DeviceDecisionErrorSchema>
