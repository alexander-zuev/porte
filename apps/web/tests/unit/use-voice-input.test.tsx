// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useVoiceInput, type VoiceInput } from '@web/features/conversation/hooks/use-voice-input.ts'
import type {
  Recording,
  VoiceRecorderPort,
} from '@web/features/conversation/services/voice-recorder.ts'
import type { VoiceRecording } from '@web/lib/conversation/voice-transcription.ts'
import { describe, expect, it, vi } from 'vitest'

const audio: VoiceRecording = { audio: new Blob(['a']), mimeType: 'audio/webm' }

function fakeRecording(): Recording {
  return { startedAt: Date.now(), level: () => 0.5, stop: async () => audio, cancel: vi.fn() }
}

function harness(transcribe = vi.fn(async () => ({ text: 'push when green' }))) {
  const recording = fakeRecording()
  const recorder: VoiceRecorderPort = { start: async () => recording }
  const onText = vi.fn()
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  const rendered = renderHook(() => useVoiceInput({ recorder, transcribe, onText }), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  })
  return { rendered, recording, transcribe, onText }
}

function current(rendered: { result: { current: VoiceInput } }): VoiceInput {
  return rendered.result.current
}

async function startRecording(rendered: { result: { current: VoiceInput } }) {
  act(() => {
    const voice = current(rendered)
    if (voice.status === 'idle') voice.start()
  })
  await waitFor(() => expect(current(rendered).status).toBe('recording'))
}

describe('useVoiceInput', () => {
  it('starts a recording from idle', async () => {
    const { rendered } = harness()
    await startRecording(rendered)
  })

  it('finish transcribes the recording, hands the text over, and returns to idle', async () => {
    const { rendered, transcribe, onText } = harness()
    await startRecording(rendered)
    act(() => {
      const voice = current(rendered)
      if (voice.status === 'recording') voice.finish()
    })
    await waitFor(() => expect(onText).toHaveBeenCalledWith('push when green'))
    // First argument only: the query client appends its own context argument.
    expect(transcribe.mock.calls[0]?.[0]).toEqual(audio)
    expect(current(rendered).status).toBe('idle')
  })

  it('cancel discards the recording without transcribing', async () => {
    const { rendered, recording, transcribe } = harness()
    await startRecording(rendered)
    act(() => {
      const voice = current(rendered)
      if (voice.status === 'recording') voice.cancel()
    })
    expect(current(rendered).status).toBe('idle')
    expect(recording.cancel).toHaveBeenCalled()
    expect(transcribe).not.toHaveBeenCalled()
  })

  it('a failed transcription keeps the audio and retry sends the same bytes', async () => {
    const transcribe = vi
      .fn(async () => ({ text: 'second try' }))
      .mockRejectedValueOnce(new Error('down'))
    const { rendered, onText } = harness(transcribe)
    await startRecording(rendered)
    act(() => {
      const voice = current(rendered)
      if (voice.status === 'recording') voice.finish()
    })
    await waitFor(() => expect(current(rendered).status).toBe('failed'))
    act(() => {
      const voice = current(rendered)
      if (voice.status === 'failed') voice.retry()
    })
    await waitFor(() => expect(onText).toHaveBeenCalledWith('second try'))
    expect(transcribe.mock.calls[1]?.[0]).toEqual(audio)
  })

  it('cancel while transcribing drops the answer', async () => {
    let answer: (result: { text: string }) => void = () => undefined
    const transcribe = vi.fn(
      () =>
        // oxlint-disable-next-line eslint-plugin-promise(avoid-new) -- the test holds the resolver.
        new Promise<{ text: string }>((resolve) => {
          answer = resolve
        }),
    )
    const { rendered, onText } = harness(transcribe)
    await startRecording(rendered)
    act(() => {
      const voice = current(rendered)
      if (voice.status === 'recording') voice.finish()
    })
    await waitFor(() => expect(current(rendered).status).toBe('transcribing'))
    act(() => {
      const voice = current(rendered)
      if (voice.status === 'transcribing') voice.cancel()
    })
    answer({ text: 'too late' })
    await waitFor(() => expect(current(rendered).status).toBe('idle'))
    expect(onText).not.toHaveBeenCalled()
  })
})
