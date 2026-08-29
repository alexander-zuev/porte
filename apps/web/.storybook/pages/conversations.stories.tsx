import type { ConversationSummary, PairedHost } from '@porte/core/client'
import type { Meta, StoryObj } from '@storybook/tanstack-react'
import type {
  ConversationAttentionStatus,
  ConversationList,
  ConversationTurnStatus,
} from '@web/entities/conversation/conversation-list.ts'
import type { HostConnection } from '@web/entities/host/host-connection.ts'
import {
  ConversationsPage,
  type ConversationsPageProps,
} from '@web/pages/conversations/conversations-page.tsx'
import { AppHeader } from '@web/ui/components/layout/app-header.tsx'
import { AppShell } from '@web/ui/components/layout/app-shell.tsx'

import { conversations } from '../fixtures/conversations.ts'

const NONE: readonly ConversationSummary[] = []

const HOST = {
  name: "Alexander's MacBook Pro",
  platform: 'darwin',
  lastSeenAt: '2026-08-22T14:02:00.000Z',
} as PairedHost

const CONNECTING = { status: 'loading' } satisfies HostConnection
const CONNECTED = { status: 'connected' } satisfies HostConnection
const DISCONNECTED = { status: 'offline' } satisfies HostConnection

/**
 * One story per situation the page can be in.
 *
 * The state has three independent facts, so these are the combinations worth
 * designing rather than every combination that types.
 */
function page(
  connection: HostConnection,
  conversationList: ConversationList,
): ConversationsPageProps {
  return { connection, conversationList, host: HOST }
}

/** The list arrived. Paging is off unless a story says otherwise. */
function listed(
  conversations: readonly ConversationSummary[],
  firstTurnStatus: ConversationTurnStatus = 'idle',
  firstAttentionStatus: ConversationAttentionStatus = 'none',
): ConversationList {
  return {
    status: 'ready',
    conversations: conversations.map((conversation, index) => ({
      conversation,
      turnStatus: index === 0 ? firstTurnStatus : 'idle',
      attentionStatus: index === 0 ? firstAttentionStatus : 'none',
    })),
    hasMore: false,
    isLoadingMore: false,
    onLoadMore: () => undefined,
  }
}

const meta = {
  title: 'Pages/Conversations',
  component: ConversationsPage,
  parameters: { layout: 'fullscreen' },
  render: (args) => (
    <AppShell header={<AppHeader />} variant="scroll">
      <ConversationsPage {...args} />
    </AppShell>
  ),
} satisfies Meta<typeof ConversationsPage>

export default meta
type Story = StoryObj<typeof meta>

/** The line is opening. A healthy machine must never flash the offline screen here. */
export const Connecting: Story = {
  args: page(CONNECTING, listed(NONE)),
}

export const MachineOffline: Story = {
  args: page(DISCONNECTED, listed(conversations)),
}

/** Reachable, with nothing on it yet. */
export const NoConversations: Story = {
  args: page(CONNECTED, listed(NONE)),
}

export const Ready: Story = {
  args: page(CONNECTED, listed(conversations)),
}

export const Running: Story = {
  args: page(CONNECTED, listed(conversations, 'running')),
}

export const Unseen: Story = {
  args: page(CONNECTED, listed(conversations, 'idle', 'unseen')),
}

/** Running occupies the shared slot while unseen remains an independent fact. */
export const RunningWithUnseen: Story = {
  args: page(CONNECTED, listed(conversations, 'running', 'unseen')),
}
