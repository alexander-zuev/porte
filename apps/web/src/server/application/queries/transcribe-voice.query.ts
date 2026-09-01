import type { Transcription } from '@server/application/ports/transcription.ts'
import type {
  TranscribeVoiceInput,
  TranscribeVoiceResult,
} from '@web/lib/conversation/voice-transcription.ts'

/**
 * A query, not a command: transcription changes no state and repeating it is
 * safe. This is the seam where per-account policy (rate limits, length caps)
 * lands when it is needed.
 */
export function transcribeVoice(
  transcription: Transcription,
  input: TranscribeVoiceInput,
): Promise<TranscribeVoiceResult> {
  return transcription.transcribe(input)
}
