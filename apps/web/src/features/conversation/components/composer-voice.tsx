import { CheckIcon, MicrophoneIcon, XIcon } from '@phosphor-icons/react'
import type { VoiceInput } from '@web/features/conversation/hooks/use-voice-input.ts'
import { cn } from '@web/lib/utils.ts'
import { PromptInputButton } from '@web/ui/components/ai-elements/prompt-input.tsx'
import { useEffect, useRef } from 'react'

/** The mic beside the submit control; a tap starts a take. */
export function ComposerMicButton({
  disabled,
  start,
}: {
  readonly disabled: boolean
  readonly start: () => void
}) {
  return (
    <PromptInputButton
      aria-label="Record voice input"
      className="rounded-full"
      disabled={disabled}
      variant="secondary"
      onClick={start}
    >
      <MicrophoneIcon className="size-4" />
    </PromptInputButton>
  )
}

type ActiveVoice = Exclude<VoiceInput, { status: 'idle' }>

/**
 * Replaces the composer's footer row while a take is open: discard on the
 * left, the take in the middle, confirm on the right. Recording draws the
 * level trail; transcribing pulses the word and disables confirm; a failure
 * turns confirm into retry.
 */
export function ComposerVoiceBar({ voice }: { readonly voice: ActiveVoice }) {
  const discard = voice.status === 'failed' ? voice.discard : voice.cancel

  // Escape drops the take from anywhere; the bar has no focusable text field.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') discard()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
    }
  })

  return (
    <div className="flex min-h-8 flex-1 items-center gap-3">
      <PromptInputButton
        aria-label="Discard recording"
        className="rounded-full"
        variant="secondary"
        onClick={discard}
      >
        <XIcon className="size-4" />
      </PromptInputButton>

      {voice.status === 'recording' ? (
        <>
          <VoiceTrail level={voice.level} />
          <small className="tabular-nums text-muted-foreground">{takeTime(voice.seconds)}</small>
        </>
      ) : null}
      {voice.status === 'transcribing' ? (
        <output
          aria-live="polite"
          className="flex-1 animate-pulse text-center motion-reduce:animate-none"
        >
          <small className="text-muted-foreground">Transcribing…</small>
        </output>
      ) : null}
      {voice.status === 'failed' ? (
        <span
          aria-hidden
          data-still
          className="voice-take-line voice-fade h-1 flex-1 text-destructive"
        />
      ) : null}
      {voice.status === 'transcribing' ? null : (
        <output aria-live="polite" className="sr-only">
          {voice.status === 'recording' ? 'Recording' : 'Transcription failed'}
        </output>
      )}

      <PromptInputButton
        aria-label={voice.status === 'failed' ? 'Send the recording again' : 'Use recording'}
        className="rounded-full"
        disabled={voice.status === 'transcribing'}
        variant="default"
        onClick={() => {
          if (voice.status === 'recording') voice.finish()
          if (voice.status === 'failed') voice.retry()
        }}
      >
        <CheckIcon className="size-4" weight="bold" />
      </PromptInputButton>
    </div>
  )
}

/** How far the trail moves between two level samples; also the sample spacing. */
const SAMPLE_MS = 150
const SLOT = 6
const DOT = 2

/**
 * What the microphone hears, as a trail scrolling left: a dot where it was
 * quiet, a taller bar where the person spoke. Level history lives in the
 * effect, not in state — sixty renders a second would buy nothing.
 */
function VoiceTrail({ level }: { readonly level: () => number }) {
  const ref = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = ref.current
    if (canvas === null) return undefined
    const scene = canvas.getContext('2d')
    if (scene === null) return undefined
    const scale = window.devicePixelRatio
    const width = canvas.clientWidth
    const height = canvas.clientHeight
    canvas.width = Math.max(1, Math.round(width * scale))
    canvas.height = Math.max(1, Math.round(height * scale))
    scene.scale(scale, scale)

    const levels: number[] = []
    let sampledAt = 0
    let frame = requestAnimationFrame(function draw(time: number) {
      frame = requestAnimationFrame(draw)
      if (time - sampledAt >= SAMPLE_MS) {
        levels.push(level())
        sampledAt = time
        if (levels.length > Math.ceil(width / SLOT) + 2) levels.shift()
      }
      const slide = ((time - sampledAt) / SAMPLE_MS) * SLOT
      scene.clearRect(0, 0, width, height)
      scene.fillStyle = getComputedStyle(canvas).color
      levels.forEach((one, at) => {
        const x = width - DOT - (levels.length - 1 - at) * SLOT - slide
        if (x < -SLOT) return
        // `fillRect`, not `roundRect`: iOS 15 lacks roundRect, and at 2px wide
        // the difference is invisible.
        const bar = Math.max(DOT, one * height)
        scene.fillRect(x, (height - bar) / 2, DOT, bar)
      })
    })
    return () => {
      cancelAnimationFrame(frame)
    }
  }, [level])

  return <canvas ref={ref} aria-hidden className="voice-fade h-4 min-w-0 flex-1" />
}

function takeTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return `${String(minutes)}:${String(rest).padStart(2, '0')}`
}
