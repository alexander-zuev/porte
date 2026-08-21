import { z } from 'zod'

/** Stable Cloudflare message patterns for boundary-specific error classifiers. */
export const CLOUDFLARE_TRANSIENT_ERROR_PATTERNS = {
  networkConnectionLost: /network connection lost/,
  objectReset: /caused object to be reset/,
  codeUpdateReset: /reset because its code was updated/,
  objectMoved: /object has moved to a different machine/,
} as const

/** The flags the Workers runtime sets on an error it raised itself. */
const runtimeFlagsSchema = z.object({
  retryable: z.boolean().optional(),
  overloaded: z.boolean().optional(),
  durableObjectReset: z.boolean().optional(),
})

function runtimeFlags(cause: unknown): z.infer<typeof runtimeFlagsSchema> {
  const parsed = runtimeFlagsSchema.safeParse(cause)
  return parsed.success ? parsed.data : {}
}

/** The runtime says this call may be repeated. */
export function isCloudflareRetryableError(cause: unknown): boolean {
  return runtimeFlags(cause).retryable === true
}

/** The object is over capacity. Repeating adds to the load that caused it. */
export function isCloudflareOverloadedError(cause: unknown): boolean {
  return runtimeFlags(cause).overloaded === true
}

/** The object was reset, which also leaves the stub that raised this unusable. */
export function isCloudflareObjectResetError(cause: unknown): boolean {
  return runtimeFlags(cause).durableObjectReset === true
}
