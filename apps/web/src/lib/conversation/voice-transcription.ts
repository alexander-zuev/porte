import { z } from 'zod'

/** What browsers record: Chrome/Edge webm/opus, Safari mp4/AAC, Firefox ogg/opus. */
export const VoiceRecordingMimeTypes = ['audio/webm', 'audio/mp4', 'audio/ogg'] as const

export type VoiceRecordingMimeType = (typeof VoiceRecordingMimeTypes)[number]

/** What the microphone produced: the finished audio of what the person said. */
export type VoiceRecording = {
  readonly audio: Blob
  readonly mimeType: VoiceRecordingMimeType
}

export const TranscribeVoiceInputSchema = z.object({
  // 8 MB of base64 is roughly double the longest recording the composer allows.
  audio: z.base64().max(8_000_000, { error: 'The recording is too long' }),
  mimeType: z.enum(VoiceRecordingMimeTypes),
})

export type TranscribeVoiceInput = z.infer<typeof TranscribeVoiceInputSchema>

export type TranscribeVoiceResult = {
  readonly text: string
}

/** The recording as the server fn's payload; base64 in 32 KB steps keeps the stack flat. */
export async function encodeVoiceRecording(
  recording: VoiceRecording,
): Promise<TranscribeVoiceInput> {
  const bytes = new Uint8Array(await recording.audio.arrayBuffer())
  let binary = ''
  for (let at = 0; at < bytes.length; at += 32768) {
    binary += String.fromCharCode(...bytes.subarray(at, at + 32768))
  }
  return { audio: btoa(binary), mimeType: recording.mimeType }
}
