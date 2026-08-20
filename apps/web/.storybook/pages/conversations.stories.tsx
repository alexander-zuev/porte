import { IsoDateTimeSchema, type PairedHost } from '@porte/core'
import type { Meta, StoryObj } from '@storybook/tanstack-react'
import type { RelayState } from '@web/entities/host/relay-state.ts'
import { ConversationListFooter } from '@web/features/conversations/components/conversation-list-footer.tsx'
import { ConversationsHeader } from '@web/features/conversations/components/conversations-header.tsx'
import { ConversationsPage } from '@web/pages/conversations/conversations-page.tsx'

import { conversations, storyUser } from '../fixtures/conversations.ts'

const SEEN = IsoDateTimeSchema.parse('2026-08-19T14:02:00.000Z')

const HOST = {
  name: "Alexander's MacBook Pro",
  platform: 'darwin',
  lastSeenAt: '2026-08-19T14:02:00.000Z',
} as PairedHost

/**
 * One story per situation the page can be in.
 *
 * The state has three independent facts, so these are the combinations worth
 * designing rather than every combination that types.
 */
function page(relay: RelayState) {
  return {
    relay,
    header: <ConversationsHeader host={HOST} relay={relay} onStartConversation={() => undefined} />,
    footer: <ConversationListFooter user={storyUser} />,
    onOpenConversation: () => undefined,
    onStartConversation: () => undefined,
  }
}

const meta = {
  title: 'Pages/Conversations',
  component: ConversationsPage,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof ConversationsPage>

export default meta
type Story = StoryObj<typeof meta>

/** The line is opening. A healthy Mac must never flash the offline screen here. */
export const Connecting: Story = {
  args: page({ relay: 'connecting', mac: null, conversations: [] }),
}

/** Paired, and no daemon has ever arrived. */
export const NeverConnected: Story = {
  args: page({
    relay: 'open',
    mac: { online: false, lastSeenAt: null },
    conversations: [],
  }),
}

export const MacOffline: Story = {
  args: page({
    relay: 'open',
    mac: { online: false, lastSeenAt: SEEN },
    conversations: [],
  }),
}

/** Reachable, with nothing on it yet. */
export const NoConversations: Story = {
  args: page({ relay: 'open', mac: { online: true, lastSeenAt: null }, conversations: [] }),
}

export const Ready: Story = {
  args: page({ relay: 'open', mac: { online: true, lastSeenAt: null }, conversations }),
}

/** Our line dropped. The list stays, and the action goes quiet. */
export const Reconnecting: Story = {
  args: page({ relay: 'reconnecting', mac: { online: true, lastSeenAt: null }, conversations }),
}

/** Long enough to be worth saying out loud. */
export const RelayFailed: Story = {
  args: page({ relay: 'failed', mac: { online: true, lastSeenAt: null }, conversations }),
}
