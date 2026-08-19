import type { Meta, StoryObj } from '@storybook/tanstack-react'

import { ConversationPane } from '#/features/session/components/conversation-pane.tsx'
import { DashboardPage } from '#/pages/dashboard/dashboard-page.tsx'

import { sessions } from '../fixtures/sessions.ts'
import { streamingItems } from '../fixtures/sessions.ts'

const actions = {
  onOpenSession: () => undefined,
  onStartSession: () => undefined,
  onPair: () => undefined,
  onRetry: () => undefined,
}

const ready = {
  ...actions,
  state: 'ready' as const,
  hostName: "Alexander's MacBook Pro",
  hostStatus: 'online' as const,
  sessions,
  runningSessionIds: new Set<string>([sessions[0].id]),
}

const meta = {
  title: 'Pages/Home',
  component: DashboardPage,
  args: ready,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof DashboardPage>

export default meta
type Story = StoryObj<typeof meta>

export const OnlineGrouped: Story = {}

export const DesktopMasterDetail: Story = {
  args: {
    ...ready,
    selectedSessionId: sessions[0].id,
    detail: (
      <ConversationPane
        draft=""
        items={streamingItems}
        online
        permission={undefined}
        status="streaming"
        title={sessions[0].title}
        onAnswerPermission={() => undefined}
        onDraftChange={() => undefined}
        onSend={() => undefined}
        onStop={() => undefined}
      />
    ),
  },
}

export const OpeningSession: Story = {
  args: { ...ready, openingSessionId: sessions[1].id },
}

export const Loading: Story = {
  args: { ...actions, state: 'loading', hostName: "Alexander's MacBook Pro" },
}

export const Empty: Story = {
  args: { ...ready, sessions: [], runningSessionIds: new Set<string>() },
}

export const Offline: Story = {
  args: {
    ...ready,
    hostStatus: 'offline',
    lastSeen: '12 minutes ago',
    runningSessionIds: new Set<string>(),
  },
}

export const Reconnecting: Story = {
  args: { ...ready, hostStatus: 'reconnecting' },
}

export const LoadFailure: Story = {
  args: { ...actions, state: 'error', hostName: "Alexander's MacBook Pro" },
}

export const Unpaired: Story = {
  args: { ...actions, state: 'unpaired' },
}

export const PairingRevoked: Story = {
  args: { ...actions, state: 'revoked', hostName: "Alexander's MacBook Pro" },
}
