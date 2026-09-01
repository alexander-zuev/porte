import type {
  TranscribeVoiceInput,
  TranscribeVoiceResult,
} from '@web/lib/conversation/voice-transcription.ts'

/** Turns one recorded clip into text. */
export type Transcription = {
  transcribe(input: TranscribeVoiceInput): Promise<TranscribeVoiceResult>
}
