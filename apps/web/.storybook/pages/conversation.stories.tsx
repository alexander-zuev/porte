import {
  ConversationIdSchema,
  ConversationNotFoundError,
  HostIdSchema,
  IsoDateTimeSchema,
  makeConversationSummary,
  PendingPermissionSchema,
  type PairedHost,
} from '@porte/core/client'
import type { Meta, StoryObj } from '@storybook/tanstack-react'
import type { HostConnection } from '@web/entities/host/host-connection.ts'
import { ConversationMessages } from '@web/features/conversation/components/conversation-messages.tsx'
import { ConversationSkeleton } from '@web/features/conversation/components/conversation-skeleton.tsx'
import { ConversationFailed } from '@web/features/conversation/components/conversation-states.tsx'
import {
  ConversationView,
  type ConversationViewProps,
} from '@web/pages/conversation/conversation-page.tsx'
import type { OpenConversation } from '@web/pages/conversation/use-conversation.ts'
import { AppHeader } from '@web/ui/components/layout/app-header.tsx'
import { AppShell } from '@web/ui/components/layout/app-shell.tsx'
import { Button } from '@web/ui/components/ui/button.tsx'
import type { UIMessage } from 'ai'
import { useEffect, useRef, useState, type ReactNode } from 'react'

import { olderTurns, session } from '../fixtures/transcript.ts'

const CONNECTED = { status: 'connected' } satisfies HostConnection
const DISCONNECTED = { status: 'offline' } satisfies HostConnection

const HOST = {
  id: HostIdSchema.parse('01990000-0000-7000-8000-000000000001'),
  name: "Alexander's MacBook Pro",
  platform: 'darwin',
  lastSeenAt: IsoDateTimeSchema.parse('2026-08-20T09:20:14.515Z'),
  cliVersion: null,
} satisfies PairedHost

const SUMMARY = makeConversationSummary({
  id: ConversationIdSchema.parse('01a01e5d-e64c-76e2-9c93-ca69580001fd'),
  cwd: '/Users/az/projects/porte',
  gitRoot: '/Users/az/projects/porte',
  title: 'Porte account deletion without typist UoW',
  updatedAt: IsoDateTimeSchema.parse('2026-08-20T09:20:14.515Z'),
})

const PERMISSION = PendingPermissionSchema.parse({
  turnId: '01a01e5d-e64c-76e2-9c93-ca6958000200',
  permissionId: '01a01e5d-e64c-76e2-9c93-ca6958000201',
  toolCallId: 'call-2',
  title: 'Run `pnpm test` in porte',
  options: [
    { optionId: 'allow', name: 'Allow once', kind: 'allow_once' },
    { optionId: 'always', name: 'Always allow', kind: 'allow_always' },
    { optionId: 'reject', name: 'Reject', kind: 'reject_once' },
  ],
})

/** The story uses the chat connection contract without opening a WebSocket. */
const agent = {
  agent: 'ConversationAgent',
  name: SUMMARY.id,
  identified: true,
  stub: {
    cancelTurn: () => Promise.resolve(null),
    listCommands: () =>
      Promise.resolve([{ name: 'review', description: 'Review the current changes' }]),
    setModel: () => Promise.resolve(null),
    queueMessage: () => Promise.resolve(null),
    withdrawQueued: () => Promise.resolve(null),
    reorderQueued: () => Promise.resolve(null),
    sendQueuedNow: () => Promise.resolve(null),
    listChanges: () => Promise.resolve({ branch: 'main', files: [] }),
    getDiff: () => Promise.resolve({ kind: 'binary' as const }),
  },
  connectionError: null,
  send: () => undefined,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  // Never fetched from: the page hands `useAgentChat` its messages and turns the SDK's read off.
  getHttpUrl: () => '',
} satisfies OpenConversation['agent']

const open: OpenConversation = {
  agent,
  messages: [],
  permissions: [],
  state: {
    plans: [
      {
        type: 'items',
        planId: 'plan-1',
        entries: [
          { content: 'Read both implementations', status: 'completed', priority: 'high' },
          { content: 'Compare transaction boundaries', status: 'in_progress', priority: 'high' },
          { content: 'Write the recommendation', status: 'pending', priority: 'medium' },
        ],
      },
    ],
    usage: {
      usedTokens: 14_000,
      sizeTokens: 100_000,
      cost: { amount: 0.42, currency: 'USD' },
    },
    configuration: [
      {
        type: 'select',
        id: 'model',
        name: 'Model',
        category: 'model',
        currentValue: 'grok-4.6',
        options: [
          {
            type: 'option',
            value: 'grok-4.6',
            name: 'Grok 4.6',
            description: "SpaceXAI's latest frontier model",
          },
          { type: 'option', value: 'grok-4.5', name: 'Grok 4.5' },
        ],
      },
      {
        type: 'select',
        id: 'effort',
        name: 'Effort',
        category: 'effort',
        currentValue: 'high',
        options: [
          { type: 'option', value: 'xhigh', name: 'Extra High Effort' },
          {
            type: 'option',
            value: 'high',
            name: 'High Effort',
            description: 'Higher implementation quality with extensive reasoning',
          },
          { type: 'option', value: 'medium', name: 'Medium Effort' },
          { type: 'option', value: 'low', name: 'Low Effort' },
        ],
      },
    ],
    modeId: 'code',
    pending: { permissions: [], elicitations: [] },
  },
  actions: { onAnswerPermission: () => undefined },
}

/** Every state one conversation screen can be in, without a socket or a machine. */
function view(
  conversation: OpenConversation,
  connection: HostConnection = CONNECTED,
): ConversationViewProps {
  return { conversation, connection }
}

/** The frame the route puts around every arm: shell, header, and the spoken heading. */
function frame(children: ReactNode) {
  return (
    <AppShell header={<AppHeader />} variant="fill">
      <h1 className="sr-only">Conversation</h1>
      {children}
    </AppShell>
  )
}

const meta = {
  title: 'Pages/Conversation',
  component: ConversationView,
  parameters: { layout: 'fullscreen' },
  render: (args) => frame(<ConversationView {...args} />),
} satisfies Meta<typeof ConversationView>

export default meta
type Story = StoryObj<typeof meta>

/** The transcript has not been read yet: the Suspense fallback. */
export const Loading: Story = {
  args: view(open),
  render: () => frame(<ConversationSkeleton />),
}

/** The child Agent has reported nothing yet, so only the composer is here. */
export const Opening: Story = {
  args: view({
    ...open,
    state: { plans: [], pending: { permissions: [], elicitations: [] } },
  }),
}

export const Ready: Story = { args: view(open) }

/** The machine runs a turn. Stop is a command to the Host; the composer waits for `turn.finished`. */
export const Streaming: Story = {
  args: view({ ...open, state: { ...open.state, runningTurnId: PERMISSION.turnId } }),
}

/** The agent stopped to ask. Until this is answered the turn goes nowhere. */
export const AwaitingPermission: Story = {
  args: view({ ...open, permissions: [{ permission: PERMISSION, answering: false }] }),
}

/** The machine is away. The composer does not accept work. */
export const MachineOffline: Story = {
  args: view(open, DISCONNECTED),
}

/**
 * Three thousand messages, and a turn that streams on demand. The design suite
 * drives the buttons: it proves the transcript windows its rows, follows the
 * answer, and leaves a reader who scrolled up where they are.
 */
export const LongTranscript: Story = {
  args: view(open),
  render: () => frame(<LongTranscriptHarness />),
}

/** Story-only controls. Every button is the test's, so each has a stable name. */
function LongTranscriptHarness() {
  const [messages, setMessages] = useState<UIMessage[]>(() => cloneTurns(500, 'seed'))
  const [short, setShort] = useState(false)
  const timer = useRef(0)
  const stop = () => {
    window.clearInterval(timer.current)
  }
  useEffect(() => stop, [])
  const stream = () => {
    stop()
    setMessages((current) => [
      ...current,
      {
        id: `ask-${String(current.length)}`,
        role: 'user',
        parts: [{ type: 'text', text: 'Go on.' }],
      },
      {
        id: `answer-${String(current.length)}`,
        role: 'assistant',
        parts: [{ type: 'text', text: '', state: 'streaming' }],
      },
    ])
    timer.current = window.setInterval(() => {
      setMessages((current) => {
        const last = current.at(-1)
        if (last === undefined) return current
        const parts = last.parts.map((part) =>
          part.type === 'text' ? { ...part, text: part.text + CHUNK } : part,
        )
        return [...current.slice(0, -1), { ...last, parts }]
      })
    }, 50)
  }
  return (
    <>
      <div className="flex flex-wrap gap-2 p-2">
        <Button size="sm" variant="outline" onClick={stream}>
          Stream
        </Button>
        <Button size="sm" variant="outline" onClick={stop}>
          Stop stream
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setMessages((current) => [
              ...cloneTurns(9, `older-${String(current.length)}`),
              ...current,
            ])
          }}
        >
          Prepend
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setShort((value) => !value)
          }}
        >
          Shrink
        </Button>
      </div>
      <div
        className="flex min-h-0 flex-1 flex-col"
        style={short ? { flex: 'none', height: 300 } : undefined}
      >
        <ConversationMessages
          messages={messages}
          pending={false}
          readingOlder={false}
          onReadOlder={null}
        />
      </div>
    </>
  )
}

const CHUNK = ' more of the answer arrives while the reader watches the end of the transcript;'

/** The fixture session repeated, each copy under its own ids. */
function cloneTurns(turns: number, tag: string): UIMessage[] {
  const base = [...olderTurns, ...session]
  const out: UIMessage[] = []
  for (let index = 0; index < turns; index += 1) {
    for (const message of base) {
      const copy = structuredClone(message) as UIMessage
      copy.id = `${message.id}-${tag}-${String(index)}`
      for (const part of copy.parts) {
        if ('toolCallId' in part) part.toolCallId = `${part.toolCallId}-${tag}-${String(index)}`
      }
      out.push(copy)
    }
  }
  return out
}

/** The machine no longer has this conversation: the error boundary's view. */
export const Gone: Story = {
  args: view(open),
  render: () =>
    frame(
      <ConversationFailed
        error={new ConversationNotFoundError()}
        host={HOST}
        onRetry={() => undefined}
      />,
    ),
}
