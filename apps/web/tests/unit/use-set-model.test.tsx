// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, waitFor } from '@testing-library/react'
import type { ConversationAgentStub } from '@web/features/conversation/hooks/use-conversation-agent.ts'
import { useSetModel, type SetModel } from '@web/features/conversation/hooks/use-set-model.ts'
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(cleanup)

function Probe({ stub, take }: { stub: ConversationAgentStub; take: (value: SetModel) => void }) {
  take(useSetModel(stub))
  return null
}

function mount(setModel: ConversationAgentStub['setModel']) {
  const stub: ConversationAgentStub = {
    setModel,
    cancelTurn: () => Promise.resolve(null),
    listCommands: () => Promise.resolve([]),
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
    expect(hook().failed).toBe(false)
  })

  it('reports a refused switch as failed', async () => {
    const hook = mount(() => Promise.reject(new Error('offline')))
    hook().onSetModel({ modelId: 'grok-4.6' })
    await waitFor(() => {
      expect(hook().failed).toBe(true)
    })
    expect(hook().pending).toBe(false)
  })
})
