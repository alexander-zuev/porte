import type { Meta, StoryObj } from '@storybook/tanstack-react'

import { HomePage } from '#/features/home/components/home-page.tsx'

import { sessions } from '../fixtures/sessions.ts'

const meta = {
  title: 'Pages/Home',
  component: HomePage,
  args: {
    onOpenSession: () => undefined,
    onStartSession: () => undefined,
  },
} satisfies Meta<typeof HomePage>

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
