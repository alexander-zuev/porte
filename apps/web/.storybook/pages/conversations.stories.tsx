import { IsoDateTimeSchema, type ConversationSummary, type PairedHost } from '@porte/core/client'
import type { Meta, StoryObj } from '@storybook/tanstack-react'
import type { ConversationList } from '@web/entities/conversation/conversation-list.ts'
import type { HostConnection } from '@web/entities/host/host-connection.ts'
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
  connection: HostConnection,
  conversationList: ConversationList,
): ConversationsPageProps {
  return { host: HOST, connection, conversationList }
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
  args: page('loading', listed(NONE)),
}

/** Paired, and no daemon has ever arrived. */
export const NeverConnected: Story = {
  args: page('offline', listed(NONE)),
}

export const MacOffline: Story = {
  args: page('offline', listed(conversations)),
}

/** Reachable, with nothing on it yet. */
export const NoConversations: Story = {
  args: page('online', listed(NONE)),
}

export const Ready: Story = {
  args: page('online', listed(conversations)),
}

/** Long enough to be worth saying out loud. */
export const LineLost: Story = {
  args: page('online', listed(conversations)),
}

/** The read itself failed. The layout stays; only the body changes. */
export const ListFailed: Story = {
  args: page('online', {
    status: 'failed',
    error: { _tag: 'ServiceUnavailableError', message: 'Try again shortly' },
    onRetry: () => undefined,
  }),
}
