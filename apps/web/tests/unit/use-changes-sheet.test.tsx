// @vitest-environment happy-dom
import { ChangedFilePathSchema, turnIdFor, ConversationIdSchema } from '@porte/core/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, waitFor } from '@testing-library/react'
import {
  useChangesSheet,
  type ChangesSheet,
  type ChangesSource,
} from '@web/features/conversation/hooks/use-changes-sheet.ts'
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(cleanup)

const path = ChangedFilePathSchema.parse('src/a.ts')
const turn = turnIdFor(ConversationIdSchema.parse('conversation-1'), 0)
const one = {
  branch: 'main',
  files: [{ kind: 'text', path, status: 'modified', added: 2, removed: 1 }],
} as const
const none = { branch: 'main', files: [] } as const

function Probe({
  agent,
  enabled = true,
  runningTurnId,
  take,
}: {
  agent: ChangesSource
  enabled?: boolean
  runningTurnId: ReturnType<typeof turnIdFor> | undefined
  take: (value: ChangesSheet) => void
}) {
  take(useChangesSheet(agent, { enabled, runningTurnId }))
  return null
}

function mount(stub: ChangesSource['stub']) {
  const agent: ChangesSource = { name: 'conversation-1', stub }
  let latest: ChangesSheet | undefined
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const view = (runningTurnId: ReturnType<typeof turnIdFor> | undefined) => (
    <QueryClientProvider client={client}>
      <Probe
        agent={agent}
        runningTurnId={runningTurnId}
        take={(value) => {
          latest = value
        }}
      />
    </QueryClientProvider>
  )
  const rendered = render(view(undefined))
  return {
    hook: () => {
      if (latest === undefined) throw new Error('hook did not render')
      return latest
    },
    setTurn: (runningTurnId: ReturnType<typeof turnIdFor> | undefined) => {
      rendered.rerender(view(runningTurnId))
    },
  }
}

describe('useChangesSheet', () => {
  it('asks nothing and says offline while the gate is closed', () => {
    const listChanges = vi.fn(() => Promise.resolve(one))
    const agent: ChangesSource = {
      name: 'conversation-1',
      stub: { listChanges, getDiff: () => Promise.reject(new Error('no')) },
    }
    let latest: ChangesSheet | undefined
    render(
      <QueryClientProvider client={new QueryClient()}>
        <Probe
          agent={agent}
          enabled={false}
          runningTurnId={undefined}
          take={(value) => {
            latest = value
          }}
        />
      </QueryClientProvider>,
    )
    expect(latest?.changes).toEqual({ status: 'offline' })
    expect(latest?.diff).toEqual({ status: 'offline' })
    expect(listChanges).not.toHaveBeenCalled()
  })

  it('reads the list once and the diff only after a tap', async () => {
    const listChanges = vi.fn(() => Promise.resolve(one))
    const getDiff = vi.fn(() => Promise.resolve({ kind: 'binary' as const }))
    const { hook } = mount({ listChanges, getDiff })
    expect(hook().changes).toEqual({ status: 'pending' })
    await waitFor(() => {
      expect(hook().changes).toMatchObject({ status: 'ready', branch: 'main' })
    })
    expect(getDiff).not.toHaveBeenCalled()

    hook().onSelect(path)
    await waitFor(() => {
      expect(hook().diff).toEqual({ status: 'ready', diff: { kind: 'binary' } })
    })
    expect(getDiff).toHaveBeenCalledWith({ path })
    expect(listChanges).toHaveBeenCalledTimes(1)
  })

  it('re-reads when the turn ends and keeps the old list meanwhile', async () => {
    let answer = one
    const listChanges = vi.fn(() => Promise.resolve(answer))
    const { hook, setTurn } = mount({ listChanges, getDiff: () => Promise.reject(new Error('no')) })
    await waitFor(() => {
      expect(hook().changes).toMatchObject({ status: 'ready' })
    })

    setTurn(turn)
    await waitFor(() => {
      expect(listChanges).toHaveBeenCalledTimes(2)
    })
    answer = none
    setTurn(undefined)
    // The key flipped: the previous answer stays until the new one lands.
    expect(hook().changes).toMatchObject({ status: 'ready', files: one.files })
    await waitFor(() => {
      expect(hook().changes).toMatchObject({ status: 'ready', files: [] })
    })
    expect(listChanges).toHaveBeenCalledTimes(3)
  })

  it('rides out the open race: a first refusal is asked again before it shows', async () => {
    vi.useFakeTimers()
    try {
      const listChanges = vi
        .fn()
        .mockRejectedValueOnce(new Error('Host is offline'))
        .mockResolvedValueOnce(one)
      const { hook } = mount({ listChanges, getDiff: () => Promise.reject(new Error('no')) })
      await vi.advanceTimersByTimeAsync(2_000)
      expect(listChanges).toHaveBeenCalledTimes(2)
      expect(hook().changes).toMatchObject({ status: 'ready' })
    } finally {
      vi.useRealTimers()
    }
  })

  it('reports a refused read after the retries, and Retry asks again', async () => {
    vi.useFakeTimers()
    try {
      const refused = new Error('That repository is not available on this machine')
      const listChanges = vi
        .fn()
        .mockRejectedValueOnce(refused)
        .mockRejectedValueOnce(refused)
        .mockRejectedValueOnce(refused)
        .mockResolvedValueOnce(one)
      const { hook } = mount({ listChanges, getDiff: () => Promise.reject(new Error('no')) })
      // Two retries at 1 s and 2 s, then the failure shows.
      await vi.advanceTimersByTimeAsync(4_000)
      expect(listChanges).toHaveBeenCalledTimes(3)
      const view = hook().changes
      if (view.status !== 'failed') throw new Error('expected failed')
      view.onRetry()
      await vi.advanceTimersByTimeAsync(0)
      expect(hook().changes).toMatchObject({ status: 'ready' })
    } finally {
      vi.useRealTimers()
    }
  })
})
