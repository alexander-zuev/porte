import { createLogger, shouldRetryFailure } from '@porte/core/client'
import type { Transcription } from '@server/application/ports/transcription.ts'
import type {
  TranscribeVoiceInput,
  TranscribeVoiceResult,
} from '@web/lib/conversation/voice-transcription.ts'
import { Result } from 'better-result'

import { TranscriptionFailedError } from './transcription.errors.ts'

const logger = createLogger('workers-ai-transcription')

/** Bounded and short: a person is watching the composer while this runs. */
const RETRY = { times: 2, delayMs: 250, backoff: 'exponential', jitter: true } as const

/**
 * Whisper on Workers AI. Transient failures (capacity, timeout) retry briefly
 * here; terminal and unknown ones stop and reach the composer, where the kept
 * recording is the real retry. Spike 2026-09-01 proved the model takes every
 * container browsers record — webm/opus, mp4/AAC, ogg/opus — as base64.
 */
export class WorkersAiTranscription implements Transcription {
  constructor(private readonly ai: Ai) {}

  async transcribe(input: TranscribeVoiceInput): Promise<TranscribeVoiceResult> {
    const startedAt = Date.now()
    const called = await Result.tryPromise(
      {
        try: () => this.ai.run('@cf/openai/whisper-large-v3-turbo', { audio: input.audio }),
        catch: (cause) => new TranscriptionFailedError({ cause }),
      },
      {
        retry: {
          ...RETRY,
          shouldRetry: (error) =>
            shouldRetryFailure({
              classification: error.classification,
              repeatSafe: true,
              owner: 'immediate',
            }),
        },
      },
    )
    if (called.isErr()) throw called.error
    // Failures log once at the function error boundary, not here.
    logger.info('voice_transcribed', {
      details: {
        mimeType: input.mimeType,
        audioKb: Math.round((input.audio.length * 3) / 4 / 1024),
        ms: Date.now() - startedAt,
      },
    })
    return { text: called.value.text }
  }
}
