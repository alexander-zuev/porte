import { useMutation } from '@tanstack/react-query'
import type {
  Recording,
  VoiceRecorderPort,
} from '@web/features/conversation/services/voice-recorder.ts'
import type {
  TranscribeVoiceResult,
  VoiceRecording,
} from '@web/lib/conversation/voice-transcription.ts'
import { toast } from '@web/ui/components/ui/sonner.tsx'
import { useCallback, useEffect, useRef, useState } from 'react'

/** Stop on its own after this long; a forgotten recording must not run forever. */
const MAX_SECONDS = 300

/**
 * What the composer renders for voice input, derived from two facts: the open
 * recording and the transcription mutation. A finished transcription is not a
 * state — the hook calls `onText` with it and is back at `idle`.
 */
export type VoiceInput =
  | { readonly status: 'idle'; readonly start: () => void }
  | {
      readonly status: 'recording'
      readonly seconds: number
      /** The microphone's instant input level, 0 to 1, for the bar to draw. */
      readonly level: () => number
      readonly cancel: () => void
      readonly finish: () => void
    }
  | { readonly status: 'transcribing'; readonly cancel: () => void }
  | { readonly status: 'failed'; readonly retry: () => void; readonly discard: () => void }

export type VoiceInputDeps = {
  readonly recorder: VoiceRecorderPort
  readonly transcribe: (recording: VoiceRecording) => Promise<TranscribeVoiceResult>
  readonly onText: (text: string) => void
}

/**
 * Records through `recorder` and turns the recording into composer text.
 *
 * The recording starts from a tap, never from an effect, so Strict Mode replay
 * cannot double-start it. The mutation's variables keep the recording, so after
 * a failure `retry` sends the same audio without asking the person to speak twice.
 */
export function useVoiceInput({ recorder, transcribe, onText }: VoiceInputDeps): VoiceInput {
  const [recording, setRecording] = useState<Recording | null>(null)
  const [now, setNow] = useState(0)
  // Set by cancel while transcribing: the request settles on its own, and its
  // answer — text or error — must then land nowhere.
  const dropped = useRef(false)

  const transcription = useMutation({
    mutationFn: transcribe,
    onSuccess: (result) => {
      if (!dropped.current) onText(result.text)
    },
    onError: () => {
      if (dropped.current) return
      toast.error("Sorry, we didn't catch that", {
        description: 'Transcription failed. The recording is kept — ✓ tries again.',
      })
    },
  })

  const { mutate } = transcription

  // Stable (`mutate` is), so the tick effect below can list it without restarting.
  const finish = useCallback(
    (one: Recording) => {
      setRecording(null)
      void one.stop().then((audio) => {
        mutate(audio)
        return undefined
      })
    },
    [mutate],
  )

  // The clock and the length cap tick together; the cap is policy, so it lives
  // here and not in the recorder. Cleanup also closes the device on unmount.
  useEffect(() => {
    if (recording === null) return undefined
    const tick = setInterval(() => {
      setNow(Date.now())
      if (Date.now() - recording.startedAt >= MAX_SECONDS * 1000) finish(recording)
    }, 1000)
    return () => {
      clearInterval(tick)
      recording.cancel()
    }
  }, [recording, finish])

  const start = async () => {
    transcription.reset()
    dropped.current = false
    try {
      const one = await recorder.start(() => {
        setRecording(null)
      })
      setNow(Date.now())
      setRecording(one)
    } catch {
      toast.error('Microphone is unavailable', {
        description: 'Allow the microphone for this site in browser settings.',
      })
    }
  }

  if (recording !== null) {
    return {
      status: 'recording',
      seconds: Math.max(0, Math.floor((now - recording.startedAt) / 1000)),
      level: recording.level,
      cancel: () => {
        recording.cancel()
        setRecording(null)
      },
      finish: () => {
        finish(recording)
      },
    }
  }
  if (transcription.isPending) {
    return {
      status: 'transcribing',
      cancel: () => {
        dropped.current = true
        transcription.reset()
      },
    }
  }
  if (transcription.isError) {
    return {
      status: 'failed',
      discard: () => {
        transcription.reset()
      },
      retry: () => {
        transcription.mutate(transcription.variables)
      },
    }
  }
  return {
    status: 'idle',
    start: () => {
      void start()
    },
  }
}
