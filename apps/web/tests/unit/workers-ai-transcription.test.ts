import { TranscriptionFailedError } from '@server/infrastructure/ai/transcription.errors.ts'
import { WorkersAiTranscription } from '@server/infrastructure/ai/workers-ai-transcription.ts'
import { describe, expect, it, vi } from 'vitest'

const input = { audio: 'AAAA', mimeType: 'audio/webm' } as const

/** The binding's surface is one overloaded `run`; the fake narrows to this call. */
function fakeAi(run: () => Promise<unknown>): Ai {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- test double for one call shape.
  return { run } as unknown as Ai
}

async function failureOf(adapter: WorkersAiTranscription): Promise<TranscriptionFailedError> {
  const raw = await adapter.transcribe(input).catch((cause: unknown) => cause)
  expect(raw).toBeInstanceOf(TranscriptionFailedError)
  return raw as TranscriptionFailedError
}

describe('WorkersAiTranscription', () => {
  it('answers the model text', async () => {
    const spoke = new WorkersAiTranscription(fakeAi(async () => ({ text: 'push when green' })))
    await expect(spoke.transcribe(input)).resolves.toEqual({ text: 'push when green' })
  })

  it('retries a transient failure and answers the second attempt', async () => {
    const run = vi
      .fn(async () => ({ text: 'second attempt' }))
      .mockRejectedValueOnce(new Error('3040: Out of capacity'))
    const adapter = new WorkersAiTranscription(fakeAi(run))
    await expect(adapter.transcribe(input)).resolves.toEqual({ text: 'second attempt' })
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('stops on a terminal code without retrying and keeps the cause', async () => {
    const cause = new Error('5004: Invalid data type for base64 input')
    const run = vi.fn(async () => {
      throw cause
    })
    const failure = await failureOf(new WorkersAiTranscription(fakeAi(run)))
    expect(run).toHaveBeenCalledTimes(1)
    expect(failure.classification).toBe('terminal')
    expect(failure.cause).toBe(cause)
  })

  it('stops on an unclassified failure: an immediate owner cannot probe', async () => {
    const run = vi.fn(async () => {
      throw new Error('something new')
    })
    const failure = await failureOf(new WorkersAiTranscription(fakeAi(run)))
    expect(run).toHaveBeenCalledTimes(1)
    expect(failure.classification).toBe('unknown')
  })
})
