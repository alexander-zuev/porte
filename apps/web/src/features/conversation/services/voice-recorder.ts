import {
  VoiceRecordingMimeTypes,
  type VoiceRecording,
  type VoiceRecordingMimeType,
} from '@web/lib/conversation/voice-transcription.ts'

/** One recording in progress. `stop` delivers the audio; `cancel` discards it. */
export type Recording = {
  readonly startedAt: number
  /** The microphone's instant input level, 0 to 1. */
  readonly level: () => number
  readonly stop: () => Promise<VoiceRecording>
  readonly cancel: () => void
}

/** The microphone boundary. `start` rejects when the browser refuses the device. */
export type VoiceRecorderPort = {
  /** Opens one recording; `onEnded` fires when the device ends it itself (call, revocation). */
  start(onEnded: () => void): Promise<Recording>
}

/**
 * Records through the browser's MediaRecorder, one recording end to end:
 * permission, device, chunk assembly, and track teardown. Nothing else touches
 * the microphone.
 */
export class BrowserVoiceRecorder implements VoiceRecorderPort {
  async start(onEnded: () => void): Promise<Recording> {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const recorder = new MediaRecorder(stream, { mimeType: preferredMimeType() })
    const chunks: Blob[] = []
    recorder.addEventListener('dataavailable', (event) => {
      chunks.push(event.data)
    })

    // A second tap off the same stream, so the bar can draw what the mic hears.
    const audioContext = new AudioContext()
    const analyser = audioContext.createAnalyser()
    analyser.fftSize = 512
    audioContext.createMediaStreamSource(stream).connect(analyser)
    const samples = new Uint8Array(analyser.fftSize)

    const teardown = () => {
      stream.getTracks().forEach((track) => {
        track.stop()
      })
      void audioContext.close().catch(() => undefined)
    }
    // oxlint-disable-next-line eslint-plugin-promise(avoid-new) -- MediaRecorder delivers by event.
    const audio = new Promise<VoiceRecording>((resolve) => {
      recorder.addEventListener('stop', () => {
        teardown()
        resolve({
          audio: new Blob(chunks, { type: recorder.mimeType }),
          mimeType: recordedMimeType(recorder.mimeType),
        })
      })
    })
    recorder.addEventListener('error', () => {
      teardown()
      onEnded()
    })
    stream.getTracks().forEach((track) => {
      track.addEventListener('ended', () => {
        if (recorder.state !== 'inactive') recorder.stop()
        onEnded()
      })
    })

    recorder.start()
    return {
      startedAt: Date.now(),
      level: () => {
        analyser.getByteTimeDomainData(samples)
        let power = 0
        for (const sample of samples) {
          const offset = (sample - 128) / 128
          power += offset * offset
        }
        // RMS of speech is well under full scale; ×4 spreads it over 0..1.
        return Math.min(1, Math.sqrt(power / samples.length) * 4)
      },
      stop: () => {
        recorder.stop()
        return audio
      },
      cancel: () => {
        if (recorder.state !== 'inactive') recorder.stop()
      },
    }
  }
}

function preferredMimeType(): string | undefined {
  return VoiceRecordingMimeTypes.find((type) => MediaRecorder.isTypeSupported(type))
}

/** The recorder answers with codecs attached (`audio/webm;codecs=opus`); keep the container. */
function recordedMimeType(reported: string): VoiceRecordingMimeType {
  return reported.startsWith('audio/mp4') ? 'audio/mp4' : 'audio/webm'
}
