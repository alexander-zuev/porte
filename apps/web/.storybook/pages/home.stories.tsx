import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { ConversationPane } from '@web/features/conversation/components/conversation-pane.tsx'
import { ConversationListFooter } from '@web/features/dashboard/components/conversation-list-footer.tsx'
import type { ConversationListProps } from '@web/features/dashboard/components/conversation-list.tsx'
import { DashboardPage } from '@web/pages/dashboard/dashboard-page.tsx'

import {
  conversations,
  hostContract,
  listResume,
  storyUser,
  streamingItems,
} from '../fixtures/conversations.ts'

const actions = {
  onOpenConversation: () => undefined,
  onStartConversation: () => undefined,
  onPair: () => undefined,
  onRetry: () => undefined,
}

const HOST_NAME = "Alexander's MacBook Pro"

const ready = {
  ...actions,
  state: 'ready',
  hostName: HOST_NAME,
  hostStatus: 'online',
  conversations,
  runningConversationIds: new Set<string>([listResume.id]),
} satisfies ConversationListProps

/** Every conversation story renders the two-pane shape with the account footer. */
function conversationsView(list: ConversationListProps, detail?: React.ReactNode) {
  return {
    view: 'conversations',
    list,
    detail,
    footer: <ConversationListFooter user={storyUser} />,
  } as const
}

const meta = {
  title: 'Pages/Home',
  component: DashboardPage,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof DashboardPage>

export default meta
type Story = StoryObj<typeof meta>

export const OnlineGrouped: Story = {
  args: conversationsView(ready),
}

export const DesktopMasterDetail: Story = {
  args: conversationsView(
    { ...ready, selectedConversationId: listResume.id },
    <ConversationPane
      actions={{
        onAnswerElicitation: () => undefined,
        onAnswerPermission: () => undefined,
        onBack: () => undefined,
        onDraftChange: () => undefined,
        onElicitationValueChange: () => undefined,
        onOpenElicitationUrl: () => undefined,
        onRetryPermission: () => undefined,
        onSend: () => undefined,
        onStop: () => undefined,
        onSubmitElicitation: () => undefined,
      }}
      connection="online"
      control={{ state: 'running' }}
      draft=""
      hostName={HOST_NAME}
      items={streamingItems}
      conversation={listResume}
    />,
  ),
}

export const OpeningConversation: Story = {
  args: conversationsView({ ...ready, openingConversationId: hostContract.id }),
}

export const Loading: Story = {
  args: conversationsView({ ...actions, state: 'loading', hostName: HOST_NAME }),
}

export const Empty: Story = {
  args: conversationsView({
    ...ready,
    conversations: [],
    runningConversationIds: new Set<string>(),
  }),
}

export const Offline: Story = {
  args: conversationsView({
    ...ready,
    hostStatus: 'offline',
    lastSeen: '12 minutes ago',
    runningConversationIds: new Set<string>(),
  }),
}

export const Reconnecting: Story = {
  args: conversationsView({ ...ready, hostStatus: 'reconnecting' }),
}

export const LoadFailure: Story = {
  args: conversationsView({ ...actions, state: 'error', hostName: HOST_NAME }),
}

/** No Mac: the pairing prompt takes the page instead of an empty two-pane shell. */
export const Unpaired: Story = {
  args: { view: 'pair', reason: 'unpaired', onEnterCode: () => undefined },
}

export const PairingRevoked: Story = {
  args: {
    view: 'pair',
    reason: 'revoked',
    hostName: HOST_NAME,
    onEnterCode: () => undefined,
  },
}
