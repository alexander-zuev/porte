import { transcribeVoice } from '@server/entrypoints/functions/transcription.fn.ts'
import { useVoiceInput, type VoiceInput } from '@web/features/conversation/hooks/use-voice-input.ts'
import { BrowserVoiceRecorder } from '@web/features/conversation/services/voice-recorder.ts'
import { encodeVoiceRecording } from '@web/lib/conversation/voice-transcription.ts'
import { usePromptInputController } from '@web/ui/components/ai-elements/prompt-input.tsx'

/** Stateless between recordings, so one instance serves every composer. */
const recorder = new BrowserVoiceRecorder()

/**
 * Voice input bound to the app: the browser microphone, the `transcribeVoice`
 * server fn, and the composer's text. The transcript appends to whatever is
 * already typed; it never replaces it.
 */
export function useComposerVoice(): VoiceInput {
  const controller = usePromptInputController()
  return useVoiceInput({
    recorder,
    transcribe: async (recording) =>
      transcribeVoice({ data: await encodeVoiceRecording(recording) }),
    onText: (text) => {
      const value = controller.textInput.value
      controller.textInput.setInput(value === '' ? text : `${value} ${text}`)
    },
  })
}
