import { IsoDateTimeSchema, type ConversationSummary, type PairedHost } from '@porte/core/client'
import type { Meta, StoryObj } from '@storybook/tanstack-react'
import type { ConversationList } from '@web/entities/conversation/conversation-list.ts'
import type { HostConnection } from '@web/entities/host/host-connection.ts'
import type { RelayState } from '@web/entities/host/relay-state.ts'
import { ConversationListFooter } from '@web/features/conversations/components/conversation-list-footer.tsx'
import { ConversationsHeader } from '@web/features/conversations/components/conversations-header.tsx'
import {
  ConversationsPage,
  type ConversationsPageProps,
} from '@web/pages/conversations/conversations-page.tsx'
import { AppShell } from '@web/ui/components/layout/app-shell.tsx'

import { conversations, storyUser } from '../fixtures/conversations.ts'

const SEEN = IsoDateTimeSchema.parse('2026-08-19T14:02:00.000Z')

const HOST = {
  name: "Alexander's MacBook Pro",
  platform: 'darwin',
  lastSeenAt: '2026-08-19T14:02:00.000Z',
} as PairedHost

const NONE: readonly ConversationSummary[] = []

/**
 * One story per situation the page can be in.
 *
 * The state has three independent facts, so these are the combinations worth
 * designing rather than every combination that types.
 */
function page(
  relay: RelayState,
  conversationList: ConversationList,
  connection: HostConnection = { status: 'online' },
): ConversationsPageProps {
  return {
    host: HOST,
    relay,
    conversationList,
    connection,
  }
}

/** The list arrived. Paging is off unless a story says otherwise. */
function listed(conversations: readonly ConversationSummary[]): ConversationList {
  return {
    status: 'ready',
    conversations,
    hasMore: false,
    isLoadingMore: false,
    onLoadMore: () => undefined,
  }
}

const meta = {
  title: 'Pages/Conversations',
  component: ConversationsPage,
  parameters: { layout: 'fullscreen' },
  // The frame comes from the `_app` route, so the story supplies it instead.
  decorators: [
    (Story) => (
      <AppShell variant="scroll">
        <Story />
      </AppShell>
    ),
  ],
} satisfies Meta<typeof ConversationsPage>

export default meta
type Story = StoryObj<typeof meta>

/** The line is opening. A healthy Mac must never flash the offline screen here. */
export const Connecting: Story = {
  args: page({ line: 'connecting', mac: null }, listed(NONE)),
}

/** Paired, and no daemon has ever arrived. */
export const NeverConnected: Story = {
  args: page({ line: 'open', mac: { online: false, lastSeenAt: null } }, listed(NONE)),
}

export const MacOffline: Story = {
  args: page({ line: 'open', mac: { online: false, lastSeenAt: SEEN } }, listed(conversations)),
}

/** Reachable, with nothing on it yet. */
export const NoConversations: Story = {
  args: page({ line: 'open', mac: { online: true, lastSeenAt: null } }, listed(NONE)),
}

export const Ready: Story = {
  args: page({ line: 'open', mac: { online: true, lastSeenAt: null } }, listed(conversations)),
}

/** Our line dropped. The list stays, and the action goes quiet. */
export const Reconnecting: Story = {
  args: page(
    { line: 'reconnecting', mac: { online: true, lastSeenAt: null } },
    listed(conversations),
  ),
}

/** Long enough to be worth saying out loud. */
export const LineLost: Story = {
  args: page({ line: 'lost', mac: { online: true, lastSeenAt: null } }, listed(conversations)),
}

/** The read itself failed. The layout stays; only the body changes. */
export const ListFailed: Story = {
  args: page(
    { line: 'open', mac: { online: true, lastSeenAt: SEEN } },
    {
      status: 'failed',
      error: { _tag: 'ServiceUnavailableError', message: 'Try again shortly' },
      onRetry: () => undefined,
    },
  ),
}
