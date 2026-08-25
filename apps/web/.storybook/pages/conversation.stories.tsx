import { makeConversationSummary, PendingPermissionSchema } from '@porte/core/client'
import type { Meta, StoryObj } from '@storybook/tanstack-react'
import type { ConversationState } from '@web/entities/conversation/use-conversation.ts'
import type { HostConnection } from '@web/entities/host/host-connection.ts'
import {
  ConversationPage,
  type ConversationPageProps,
} from '@web/pages/conversation/conversation-page.tsx'
import { AppHeader } from '@web/ui/components/layout/app-header.tsx'
import { AppShell } from '@web/ui/components/layout/app-shell.tsx'

const CONNECTED = { status: 'connected' } satisfies HostConnection
const DISCONNECTED = {
  status: 'disconnected',
  reconnecting: false,
  reconnect: () => undefined,
} satisfies HostConnection

const SUMMARY = makeConversationSummary({
  id: '01a01e5d-e64c-76e2-9c93-ca69580001fd',
  cwd: '/Users/az/projects/porte',
  gitRoot: '/Users/az/projects/porte',
  title: 'Porte account deletion without typist UoW',
  updatedAt: '2026-08-20T09:20:14.515Z',
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
  OPEN: 1,
  readyState: 1,
  connectionError: null,
  send: () => undefined,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  getHttpUrl: () => 'http://localhost/api/host/ws',
} satisfies Extract<ConversationState, { status: 'ready' }>['agent']

const ready: Extract<ConversationState, { status: 'ready' }> = {
  status: 'ready',
  agent,
  permissions: [],
  state: {
    status: 'ready',
    turn: { state: 'idle' },
    items: [],
    tools: [],
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
    commands: [{ name: 'review', description: 'Review the current changes' }],
    modeId: 'code',
    pending: { permissions: [], elicitations: [] },
  },
  actions: { onAnswerPermission: () => undefined },
}

/** Every state one conversation screen can be in, without a socket or a Mac. */
function page(
  conversation: ConversationState,
  connection: HostConnection = CONNECTED,
): ConversationPageProps {
  return { conversation, connection }
}

const meta = {
  title: 'Pages/Conversation',
  component: ConversationPage,
  parameters: { layout: 'fullscreen' },
  render: (args) => (
    <AppShell header={<AppHeader />} variant="fill">
      <ConversationPage {...args} />
    </AppShell>
  ),
} satisfies Meta<typeof ConversationPage>

export default meta
type Story = StoryObj<typeof meta>

/** The conversation state has not arrived from the child Agent. */
export const Opening: Story = { args: page({ status: 'pending' }) }

export const Ready: Story = { args: page(ready) }

/** The agent stopped to ask. Until this is answered the turn goes nowhere. */
export const AwaitingPermission: Story = {
  args: page({ ...ready, permissions: [{ permission: PERMISSION, answering: false }] }),
}

/** The Mac is away. The composer does not accept work. */
export const MacOffline: Story = {
  args: page(ready, DISCONNECTED),
}
