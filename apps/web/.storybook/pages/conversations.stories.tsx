import type { Meta, StoryObj } from '@storybook/tanstack-react'
import type { HostConnection } from '@web/entities/host/host-connection.ts'
import { ConversationListFooter } from '@web/features/conversations/components/conversation-list-footer.tsx'
import { ConversationsHeader } from '@web/features/conversations/components/conversations-header.tsx'
import { ConversationsPage } from '@web/pages/conversations/conversations-page.tsx'

import { conversations, storyUser } from '../fixtures/conversations.ts'

const HOST_NAME = "Alexander's MacBook Pro"

/**
 * One story for each state the page can be in.
 *
 * The union has six members, so this file has six stories. A state that cannot
 * be seen here is a state nobody has designed.
 */
function page(connection: HostConnection) {
  return {
    connection,
    header: (
      <ConversationsHeader
        connection={connection}
        hostName={HOST_NAME}
        onStartConversation={() => undefined}
      />
    ),
    footer: <ConversationListFooter user={storyUser} />,
    onOpenConversation: () => undefined,
    onStartConversation: () => undefined,
    onRetry: () => undefined,
  }
}

const meta = {
  title: 'Pages/Conversations',
  component: ConversationsPage,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof ConversationsPage>

export default meta
type Story = StoryObj<typeof meta>

/** The socket is opening. A healthy Mac must never flash the offline screen. */
export const Connecting: Story = {
  args: page({ state: 'connecting' }),
}

/** Paired moments ago, and no daemon has ever arrived. */
export const NeverConnected: Story = {
  args: page({ state: 'offline', lastSeenAt: null }),
}

/** Seen before, gone now, and nothing was ever synced to show. */
export const Offline: Story = {
  args: page({ state: 'offline', lastSeenAt: '2026-08-19T14:02:00.000Z' }),
}

/** Unreachable, but the relay still holds the last list it was told about. */
export const Stale: Story = {
  args: page({ state: 'stale', lastSeenAt: '2026-08-19T14:02:00.000Z', conversations }),
}

/** Reachable, with nothing on it yet. */
export const Empty: Story = {
  args: page({ state: 'empty' }),
}

export const Ready: Story = {
  args: page({ state: 'ready', conversations }),
}

export const Failed: Story = {
  args: page({ state: 'failed', reason: 'The connection closed before it opened.' }),
}
