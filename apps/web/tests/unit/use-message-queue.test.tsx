// @vitest-environment happy-dom
import { MessageIdSchema } from '@porte/core/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, waitFor } from '@testing-library/react'
import type { ConversationAgentStub } from '@web/features/conversation/hooks/use-conversation-agent.ts'
import {
  useMessageQueue,
  type MessageQueue,
} from '@web/features/conversation/hooks/use-message-queue.ts'
import { queuedRowMetadata } from '@web/lib/conversation/conversation-state-messages.ts'
import { toast } from '@web/ui/components/ui/sonner.tsx'
import type { UIMessage } from 'ai'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@web/ui/components/ui/sonner.tsx', () => ({ toast: { error: vi.fn() } }))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const rows: UIMessage[] = [
  { id: 'u1', role: 'user', metadata: { turnId: 't1' }, parts: [{ type: 'text', text: 'sent' }] },
  {
    id: 'q2',
    role: 'user',
    metadata: queuedRowMetadata(2),
    parts: [
      { type: 'text', text: 'later' },
      { type: 'file', mediaType: 'image/png', url: 'data:' },
    ],
  },
  {
    id: 'q1',
    role: 'user',
    metadata: queuedRowMetadata(1),
    parts: [{ type: 'text', text: 'next' }],
  },
]

function Probe({
  stub,
  messages,
  take,
}: {
  stub: ConversationAgentStub
  messages: readonly UIMessage[]
  take: (value: MessageQueue) => void
}) {
  take(useMessageQueue(stub, messages))
  return null
}

function mount(overrides: Partial<ConversationAgentStub>, messages: readonly UIMessage[] = rows) {
  const stub: ConversationAgentStub = {
    cancelTurn: () => Promise.resolve(null),
    listCommands: () => Promise.resolve([]),
    setModel: () => Promise.resolve(null),
    queueMessage: () => Promise.resolve(null),
    withdrawQueued: () => Promise.resolve(null),
    reorderQueued: () => Promise.resolve(null),
    sendQueuedNow: () => Promise.resolve(null),
    listChanges: () => Promise.resolve({ branch: 'main', files: [] }),
    getDiff: () => Promise.resolve({ kind: 'binary' as const }),
    ...overrides,
  }
  let latest: MessageQueue | undefined
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Probe
        messages={messages}
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

describe('useMessageQueue', () => {
  it('lists queued rows in run order with text and file counts', () => {
    const hook = mount({})
    expect(hook().queued).toEqual([
      { id: 'q1', position: 1, text: 'next', files: 0 },
      { id: 'q2', position: 2, text: 'later', files: 1 },
    ])
  })

  it('queues the composer message with a minted id and its parts', async () => {
    const queueMessage = vi.fn(() => Promise.resolve(null))
    const hook = mount({ queueMessage })
    hook().queue({
      text: 'hello',
      files: [{ type: 'file', mediaType: 'image/png', url: 'data:x', filename: 'a.png' }],
    })
    await waitFor(() => {
      expect(queueMessage).toHaveBeenCalledTimes(1)
    })
    const input = queueMessage.mock.calls[0]?.[0]
    expect(MessageIdSchema.safeParse(input?.id).success).toBe(true)
    expect(input?.parts).toEqual([
      { type: 'text', text: 'hello' },
      { type: 'file', mediaType: 'image/png', url: 'data:x', filename: 'a.png' },
    ])
  })

  it('rejects a refused queue so the composer keeps the words, and toasts', async () => {
    const hook = mount({ queueMessage: () => Promise.reject(new Error('offline')) })
    await expect(hook().queue({ text: 'hello', files: [] })).rejects.toThrow('offline')
    expect(toast.error).toHaveBeenCalledWith('Could not queue the message. Try again.')
  })

  it('hides a row while its remove is in flight and shows it again when refused', async () => {
    let refuse: (error: Error) => void = () => undefined
    const withdrawQueued = vi.fn(
      () =>
        new Promise<null>((_resolve, reject) => {
          refuse = reject
        }),
    )
    const hook = mount({ withdrawQueued })
    hook().actions.remove(MessageIdSchema.parse('q1'))
    await waitFor(() => {
      expect(hook().queued).toEqual([{ id: 'q2', position: 1, text: 'later', files: 1 }])
    })
    refuse(new Error('offline'))
    await waitFor(() => {
      expect(hook().queued.map((message) => message.id)).toEqual(['q1', 'q2'])
    })
    expect(toast.error).toHaveBeenCalledWith('Could not remove it. Try again.')
  })

  it('shows the dropped order while the reorder is in flight', async () => {
    const hook = mount({ reorderQueued: () => new Promise(() => undefined) })
    hook().actions.reorder(MessageIdSchema.parse('q2'), 1)
    await waitFor(() => {
      expect(hook().queued.map((message) => [message.id, message.position])).toEqual([
        ['q2', 1],
        ['q1', 2],
      ])
    })
  })

  it('marks the Send now row until it leaves the queue, and clears the mark when refused', async () => {
    let refuse: (error: Error) => void = () => undefined
    const sendQueuedNow = vi.fn(
      () =>
        new Promise<null>((_resolve, reject) => {
          refuse = reject
        }),
    )
    const hook = mount({ sendQueuedNow })
    const id = MessageIdSchema.parse('q1')
    hook().actions.sendNow(id)
    await waitFor(() => {
      expect(hook().sendingNow).toBe('q1')
    })
    refuse(new Error('offline'))
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Could not send it now. Try again.')
    })
    expect(hook().sendingNow).toBeNull()
    expect(sendQueuedNow).toHaveBeenCalledWith({ messageId: 'q1' })
  })
})
