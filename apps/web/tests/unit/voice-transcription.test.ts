import {
  TranscribeVoiceInputSchema,
  encodeVoiceRecording,
} from '@web/lib/conversation/voice-transcription.ts'
import { describe, expect, it } from 'vitest'

describe('TranscribeVoiceInputSchema', () => {
  it('accepts base64 audio in every browser container', () => {
    for (const mimeType of ['audio/webm', 'audio/mp4', 'audio/ogg']) {
      expect(TranscribeVoiceInputSchema.safeParse({ audio: 'AAAA', mimeType }).success).toBe(true)
    }
  })

  it('rejects an unknown container, non-base64 audio, and an oversize clip', () => {
    const parse = (input: object) => TranscribeVoiceInputSchema.safeParse(input).success
    expect(parse({ audio: 'AAAA', mimeType: 'audio/wav' })).toBe(false)
    expect(parse({ audio: 'not base64!', mimeType: 'audio/webm' })).toBe(false)
    expect(parse({ audio: 'A'.repeat(8_000_004), mimeType: 'audio/webm' })).toBe(false)
  })
})

describe('encodeVoiceRecording', () => {
  it('round-trips the audio bytes and keeps the container', async () => {
    const bytes = Uint8Array.from({ length: 70000 }, (_, at) => at % 256)
    const input = await encodeVoiceRecording({
      audio: new Blob([bytes], { type: 'audio/webm;codecs=opus' }),
      mimeType: 'audio/webm',
    })
    expect(input.mimeType).toBe('audio/webm')
    expect(Uint8Array.from(atob(input.audio), (char) => char.charCodeAt(0))).toEqual(bytes)
  })
})
