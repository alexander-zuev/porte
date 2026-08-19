import type { Meta, StoryObj } from '@storybook/tanstack-react'

import { SessionListFooter } from '#/features/dashboard/components/session-list-footer.tsx'
import type { SessionListProps } from '#/features/dashboard/components/session-list.tsx'
import { ConversationPane } from '#/features/session/components/conversation-pane.tsx'
import { DashboardPage } from '#/pages/dashboard/dashboard-page.tsx'

import { sessions, streamingItems } from '../fixtures/sessions.ts'

const actions = {
  onOpenSession: () => undefined,
  onStartSession: () => undefined,
  onPair: () => undefined,
  onRetry: () => undefined,
}

const HOST_NAME = "Alexander's MacBook Pro"

const ready = {
  ...actions,
  state: 'ready',
  hostName: HOST_NAME,
  hostStatus: 'online',
  sessions,
  runningSessionIds: new Set<string>([sessions[0].id]),
} satisfies SessionListProps

/** Every session story renders the two-pane shape with the account footer. */
function sessionsView(list: SessionListProps, detail?: React.ReactNode) {
  return {
    view: 'sessions',
    list,
    detail,
    footer: <SessionListFooter label="azuevpersonal@gmail.com" />,
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
  args: sessionsView(ready),
}

export const DesktopMasterDetail: Story = {
  args: sessionsView(
    { ...ready, selectedSessionId: sessions[0].id },
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
      session={sessions[0]}
    />,
  ),
}

export const OpeningSession: Story = {
  args: sessionsView({ ...ready, openingSessionId: sessions[1].id }),
}

export const Loading: Story = {
  args: sessionsView({ ...actions, state: 'loading', hostName: HOST_NAME }),
}

export const Empty: Story = {
  args: sessionsView({ ...ready, sessions: [], runningSessionIds: new Set<string>() }),
}

export const Offline: Story = {
  args: sessionsView({
    ...ready,
    hostStatus: 'offline',
    lastSeen: '12 minutes ago',
    runningSessionIds: new Set<string>(),
  }),
}

export const Reconnecting: Story = {
  args: sessionsView({ ...ready, hostStatus: 'reconnecting' }),
}

export const LoadFailure: Story = {
  args: sessionsView({ ...actions, state: 'error', hostName: HOST_NAME }),
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
