import { requireAuth } from '@server/entrypoints/middleware/auth.middleware.ts'
import { createServerFn } from '@tanstack/react-start'
import {
  TranscribeVoiceInputSchema,
  type TranscribeVoiceResult,
} from '@web/lib/conversation/voice-transcription.ts'

/**
 * Turn one composer recording into text.
 *
 * Mock until the Workers AI binding ships: answers a canned transcript sized
 * by the recording, so the client flow is real end to end. The real handler
 * decodes the audio and calls `@cf/openai/whisper-large-v3-turbo`; a failed
 * model call throws, and the function error middleware turns it into the
 * payload the client rejects with.
 */
export const transcribeVoice = createServerFn({ method: 'POST' })
  .middleware([requireAuth])
  .validator(TranscribeVoiceInputSchema)
  .handler(async ({ data }): Promise<TranscribeVoiceResult> => {
    const kilobytes = Math.round((data.audio.length * 3) / 4 / 1024)
    return {
      text: `Mock transcript of a ${String(kilobytes)} KB ${data.mimeType} recording.`,
    }
  })
