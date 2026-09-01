// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, waitFor } from '@testing-library/react'
import type { ConversationAgentStub } from '@web/features/conversation/hooks/use-conversation-agent.ts'
import { useSetModel, type SetModel } from '@web/features/conversation/hooks/use-set-model.ts'
import { toast } from '@web/ui/components/ui/sonner.tsx'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@web/ui/components/ui/sonner.tsx', () => ({ toast: { error: vi.fn() } }))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function Probe({ stub, take }: { stub: ConversationAgentStub; take: (value: SetModel) => void }) {
  take(useSetModel(stub))
  return null
}

function mount(setModel: ConversationAgentStub['setModel']) {
  const stub: ConversationAgentStub = {
    setModel,
    cancelTurn: () => Promise.resolve(null),
    listCommands: () => Promise.resolve([]),
    listChanges: () => Promise.resolve({ branch: 'main', files: [] }),
    getDiff: () => Promise.resolve({ kind: 'binary' as const }),
    queueMessage: () => Promise.resolve(null),
    withdrawQueued: () => Promise.resolve(null),
    reorderQueued: () => Promise.resolve(null),
    sendQueuedNow: () => Promise.resolve(null),
  }
  let latest: SetModel | undefined
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Probe
        stub={stub}
        take={(value) => {
          latest = value
        }}
      />
    </QueryClientProvider>,
  )
  return () => {
    if (latest === undefined) throw new Error('hook did not render')
    return latest
  }
}

describe('useSetModel', () => {
  it('passes the pair to the callable and settles pending', async () => {
    const setModel = vi.fn(() => Promise.resolve(null))
    const hook = mount(setModel)
    hook().onSetModel({ modelId: 'grok-4.6', reasoningEffort: 'low' })
    await waitFor(() => {
      expect(hook().pending).toBe(false)
    })
    expect(setModel).toHaveBeenCalledWith({ modelId: 'grok-4.6', reasoningEffort: 'low' })
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('raises a toast when the switch is refused', async () => {
    const hook = mount(() => Promise.reject(new Error('offline')))
    hook().onSetModel({ modelId: 'grok-4.6' })
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Could not switch. Try again.')
    })
    expect(hook().pending).toBe(false)
  })
})
