import {
  ConversationIdSchema,
  ConversationNotFoundError,
  IsoDateTimeSchema,
  makeConversationSummary,
  PendingPermissionSchema,
  type PairedHost,
} from '@porte/core/client'
import type { Meta, StoryObj } from '@storybook/tanstack-react'
import type { HostConnection } from '@web/entities/host/host-connection.ts'
import { ConversationSkeleton } from '@web/features/conversation/components/conversation-skeleton.tsx'
import { ConversationFailed } from '@web/features/conversation/components/conversation-states.tsx'
import {
  ConversationView,
  type ConversationViewProps,
} from '@web/pages/conversation/conversation-page.tsx'
import type { OpenConversation } from '@web/pages/conversation/use-conversation.ts'
import { AppHeader } from '@web/ui/components/layout/app-header.tsx'
import { AppShell } from '@web/ui/components/layout/app-shell.tsx'
import type { ReactNode } from 'react'

const CONNECTED = { status: 'connected' } satisfies HostConnection
const DISCONNECTED = { status: 'offline' } satisfies HostConnection

const HOST = {
  name: "Alexander's MacBook Pro",
  platform: 'darwin',
  lastSeenAt: IsoDateTimeSchema.parse('2026-08-20T09:20:14.515Z'),
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
        currentValue: 'grok-code',
        options: [{ type: 'option', value: 'grok-code', name: 'Grok Code' }],
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
