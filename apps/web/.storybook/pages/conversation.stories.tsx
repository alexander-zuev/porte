import {
  HostOfflineError,
  IsoDateTimeSchema,
  makeConversationIdentity,
  PendingPermissionSchema,
  type PairedHost,
} from '@porte/core/client'
import type { Meta, StoryObj } from '@storybook/tanstack-react'
import type { ConversationView } from '@web/entities/conversation/use-conversation.ts'
import type { HostConnection } from '@web/entities/host/host-connection.ts'
import {
  ConversationPage,
  type ConversationPageProps,
} from '@web/pages/conversation/conversation-page.tsx'
import { AppShell } from '@web/ui/components/layout/app-shell.tsx'
import type { ChatTransport, UIMessage } from 'ai'

const HOST = {
  name: "Alexander's MacBook Pro",
  platform: 'darwin',
  lastSeenAt: '2026-08-19T14:02:00.000Z',
} as PairedHost

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
        state: 'output-available',
        input: { kind: 'read', locations: [] },
        output: [
          { type: 'content', content: { type: 'text', text: 'export class UnitOfWork {}' } },
        ],
      },
      {
        type: 'text',
        text: 'Typist wraps writes in a **unit of work**. Porte does not need one yet.',
        state: 'done',
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

/** No socket and no Mac: a story sends nothing, so nothing has to answer. */
const transport: ChatTransport<UIMessage> = {
  sendMessages: () => Promise.resolve(new ReadableStream()),
  reconnectToStream: () => Promise.resolve(null),
}

const ready: Extract<ConversationView, { status: 'ready' }> = {
  status: 'ready',
  conversation: SUMMARY,
  messages,
  transport,
  permissions: [],
  onReadOlder: null,
  readingOlder: false,
  resuming: false,
  actions: { onAnswerPermission: () => undefined },
}

/** Every state one conversation screen can be in, without a socket or a Mac. */
function page(
  view: ConversationView,
  connection: HostConnection = 'online',
  canSend = true,
): ConversationPageProps {
  return { conversationId: SUMMARY.id, view, host: HOST, connection, canSend }
}

const meta = {
  title: 'Pages/Conversation',
  component: ConversationPage,
  parameters: { layout: 'fullscreen' },
  // The frame comes from the `_app` route, so the story supplies it instead.
  decorators: [
    (Story) => (
      <AppShell variant="fill">
        <Story />
      </AppShell>
    ),
  ],
} satisfies Meta<typeof ConversationPage>

export default meta
type Story = StoryObj<typeof meta>

/** The transcript is being read. No agent has started. */
export const Opening: Story = { args: page({ status: 'pending' }) }

export const Ready: Story = { args: page(ready) }

/** Nothing said yet, which is a new conversation rather than a failure. */
export const Empty: Story = { args: page({ ...ready, messages: [] }) }

/** A long conversation opens at its end, with the turns before it on request. */
export const HasOlderTurns: Story = {
  args: page({ ...ready, onReadOlder: () => undefined }),
}

/** The agent stopped to ask. Until this is answered the turn goes nowhere. */
export const AwaitingPermission: Story = {
  args: page({ ...ready, permissions: [{ permission: PERMISSION, answering: false }] }),
}

/** The answer is on its way, so the same question cannot be answered twice. */
export const AnsweringPermission: Story = {
  args: page({ ...ready, permissions: [{ permission: PERMISSION, answering: true }] }),
}

// Streaming and submitted are `useChat`'s to report, and it only reports them
// after a send. They belong to a story that sends, not to one that renders.

/** The Mac is away. The transcript stays; the composer does not accept work. */
export const MacOffline: Story = {
  args: page(ready, 'offline', false),
}

/** Our socket dropped while the conversation was open. The Mac is fine; we cannot reach it. */
export const LineDown: Story = {
  args: page(ready, 'online', false),
}

/** The read failed because the Mac is not running Porte. */
export const FailedHostOffline: Story = {
  args: page({
    status: 'failed',
    error: { _tag: 'HostOfflineError', message: new HostOfflineError().message },
    onRetry: () => undefined,
  }),
}

/** The conversation was removed on the Mac. */
export const FailedNotFound: Story = {
  args: page({
    status: 'failed',
    error: { _tag: 'ConversationNotFoundError', message: 'Conversation is not open.' },
    onRetry: () => undefined,
  }),
}
