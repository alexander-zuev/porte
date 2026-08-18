import type { Meta, StoryObj } from '@storybook/tanstack-react'

import { DashboardPage } from '#/pages/dashboard/dashboard-page.tsx'

import { sessions } from '../fixtures/sessions.ts'

const meta = {
  title: 'Pages/Home',
  component: DashboardPage,
  args: {
    onOpenSession: () => undefined,
    onStartSession: () => undefined,
  },
} satisfies Meta<typeof DashboardPage>

export default meta
type Story = StoryObj<typeof meta>

export const OnlineGrouped: Story = {
  args: {
    online: true,
    sessions,
  },
}

export const Offline: Story = {
  args: {
    online: false,
    sessions,
  },
}

export const Empty: Story = {
  args: {
    online: true,
    sessions: [],
  },
}
