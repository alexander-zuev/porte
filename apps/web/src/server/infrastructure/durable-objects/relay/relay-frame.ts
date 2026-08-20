import { z } from 'zod'

const textFrameSchema = z.string()
const jsonValueSchema = z.json()

/** Any JSON a frame may hold, before anything decides what it means. */
export type JsonValue = z.infer<typeof jsonValueSchema>

/**
 * One frame off a socket, read once.
 *
 * Two ways a frame is unusable and neither is exceptional: it arrived as bytes
 * when the protocol is text, or its text is not JSON. They are reported apart
 * because they close the socket with different codes.
 */
export type FrameRead =
  | { readonly ok: true; readonly json: JsonValue }
  | { readonly ok: false; readonly reason: 'not-text' | 'not-json' }

export function readFrame(frame: string | ArrayBuffer): FrameRead {
  const text = textFrameSchema.safeParse(frame)
  if (!text.success) return { ok: false, reason: 'not-text' }

  try {
    return { ok: true, json: jsonValueSchema.parse(JSON.parse(text.data)) }
  } catch {
    return { ok: false, reason: 'not-json' }
  }
}
