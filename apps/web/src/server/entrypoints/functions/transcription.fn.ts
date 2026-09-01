import { transcribeVoice as transcribeVoiceQuery } from '@server/application/queries/transcribe-voice.query.ts'
import { requireAuth } from '@server/entrypoints/middleware/auth.middleware.ts'
import { createServerFn } from '@tanstack/react-start'
import {
  TranscribeVoiceInputSchema,
  type TranscribeVoiceResult,
} from '@web/lib/conversation/voice-transcription.ts'

/**
 * Turn one composer recording into text. A failed model call throws, and the
 * function error middleware turns it into the payload the client rejects with.
 */
export const transcribeVoice = createServerFn({ method: 'POST' })
  .middleware([requireAuth])
  .validator(TranscribeVoiceInputSchema)
  .handler(async ({ context, data }): Promise<TranscribeVoiceResult> => {
    return transcribeVoiceQuery(context.deps.transcription, data)
  })
