import { WorkersAiTranscription } from '@server/infrastructure/ai/workers-ai-transcription.ts'
import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'

import { voiceMp4Aac, voiceOggOpus, voiceWebmOpus } from './fixtures/voice-clips.ts'

/**
 * Proves the adapter and model accept every container browsers record:
 * Chrome webm/opus, Safari mp4/AAC, Firefox ogg/opus. The AI binding is
 * remote — each run is three real, billed whisper calls. The clip says
 * "Fix the failing relay test and push when green."
 */
describe('WorkersAiTranscription on browser recordings', () => {
  // The combined Env type marks AI optional; the test env always binds it.
  if (env.AI === undefined) throw new Error('AI binding missing in the test environment')
  const adapter = new WorkersAiTranscription(env.AI)
  const clips = [
    ['audio/webm', voiceWebmOpus],
    ['audio/mp4', voiceMp4Aac],
    ['audio/ogg', voiceOggOpus],
  ] as const

  for (const [mimeType, audio] of clips) {
    it(`transcribes ${mimeType}`, { timeout: 20_000 }, async () => {
      const answer = await adapter.transcribe({ audio, mimeType })
      expect(answer.text.toLowerCase()).toContain('relay test')
    })
  }
})
