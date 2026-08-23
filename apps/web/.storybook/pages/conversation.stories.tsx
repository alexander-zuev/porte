import {
  IsoDateTimeSchema,
  makeConversationIdentity,
  PendingPermissionSchema,
  type PairedHost,
} from '@porte/core/client'
import type { Meta, StoryObj } from '@storybook/tanstack-react'
import type { ConversationState } from '@web/entities/conversation/use-conversation.ts'
import type { HostConnection } from '@web/entities/host/host-connection.ts'
import {
  ConversationPage,
  type ConversationPageProps,
} from '@web/pages/conversation/conversation-page.tsx'
import { AppHeader } from '@web/ui/components/layout/app-header.tsx'
import { AppShell } from '@web/ui/components/layout/app-shell.tsx'
import type { UIMessage } from 'ai'

const HOST = {
  name: "Alexander's MacBook Pro",
  platform: 'darwin',
  lastSeenAt: IsoDateTimeSchema.parse('2026-08-19T14:02:00.000Z'),
} as PairedHost

const CONNECTED = { status: 'connected' } satisfies HostConnection
const DISCONNECTED = {
  status: 'disconnected',
  reconnecting: false,
  reconnect: () => undefined,
} satisfies HostConnection

const SUMMARY = makeConversationIdentity({
  id: '01a01e5d-e64c-76e2-9c93-ca69580001fd',
  cwd: '/Users/az/projects/porte',
  title: 'Porte account deletion without typist UoW',
  updatedAt: '2026-08-20T09:20:14.515Z',
})

const messages: UIMessage[] = [
  {
    id: 'm1',
    role: 'user',
    parts: [{ type: 'text', text: 'Compare typist’s unit of work with ours.' }],
  },
  {
    id: 'm2',
    role: 'assistant',
    parts: [
      {
        type: 'reasoning',
        text: 'The user wants a comparison, so read both first.',
        state: 'done',
      },
      {
        type: 'dynamic-tool',
        toolCallId: 'call-1',
        toolName: 'read_file',
        title: 'Read unit-of-work.ts',
        state: 'output-available',
        input: {
          value: { path: 'src/unit-of-work.ts' },
          title: 'Read unit-of-work.ts',
          kind: 'read',
          locations: [],
          _meta: null,
        },
        output: {
          content: [
            { type: 'content', content: { type: 'text', text: 'export class UnitOfWork {}' } },
          ],
          rawOutput: { bytes: 26 },
        },
      },
      {
        type: 'text',
        text: 'Typist wraps writes in a **unit of work**. Porte does not need one yet.',
        state: 'done',
      },
      {
        type: 'source-url',
        sourceId: 'https://github.com/alexander-zuev/porte',
        url: 'https://github.com/alexander-zuev/porte',
        title: 'Porte repository',
      },
    ],
  },
]

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
  identity: SUMMARY,
  messages,
  agent,
  permissions: [],
  state: {
    status: 'ready',
    turn: { state: 'idle' },
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
  onReadOlder: null,
  readingOlder: false,
  actions: { onAnswerPermission: () => undefined },
}

/** Every state one conversation screen can be in, without a socket or a Mac. */
function page(
  conversation: ConversationState,
  connection: HostConnection = CONNECTED,
): ConversationPageProps {
  return { conversation, connection, host: HOST }
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

/** The transcript is being read. No agent has started. */
export const Opening: Story = { args: page({ status: 'pending' }) }

export const Ready: Story = { args: page(ready) }

/** The agent stopped to ask. Until this is answered the turn goes nowhere. */
export const AwaitingPermission: Story = {
  args: page({ ...ready, permissions: [{ permission: PERMISSION, answering: false }] }),
}

/** The Mac is away. The transcript stays; the composer does not accept work. */
export const MacOffline: Story = {
  args: page(ready, DISCONNECTED),
}

/** The read failed because Porte is not connected on the Mac. */
export const FailedHostOffline: Story = {
  args: page(
    {
      status: 'failed',
      error: { _tag: 'HostOfflineError', message: 'Host is offline' },
      onRetry: () => undefined,
    },
    DISCONNECTED,
  ),
}

/** The conversation was removed on the Mac. */
export const FailedNotFound: Story = {
  args: page({
    status: 'failed',
    error: { _tag: 'ConversationNotFoundError', message: 'Conversation is not open.' },
    onRetry: () => undefined,
  }),
}
