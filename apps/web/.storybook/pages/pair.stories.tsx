import type { Meta, StoryObj } from '@storybook/tanstack-react'

import { PairingPlay } from '../harnesses/pairing-play.tsx'

const meta = {
  title: 'Pages/Pair',
  component: PairingPlay,
  args: { start: 'code-entry' },
} satisfies Meta<typeof PairingPlay>

export default meta
type Story = StoryObj<typeof meta>

/** The whole journey: type the code, approve it, watch the Mac arrive. */
export const Interactive: Story = {
  args: { start: 'code-entry', simulateRemote: true },
}

export const CodeEntry: Story = {
  args: { start: 'code-entry' },
}

export const ExpiredCode: Story = {
  args: { start: 'expired-code' },
}

export const Confirm: Story = {
  args: { start: 'confirm' },
}

export const Approved: Story = {
  args: { start: 'approved' },
}

export const Denied: Story = {
  args: { start: 'denied' },
}

export const Expired: Story = {
  args: { start: 'expired' },
}

export const AlreadyDecided: Story = {
  args: { start: 'already-decided' },
}

/** The code belongs to another account, so this one cannot approve it. */
export const NotYours: Story = {
  args: { start: 'not-yours' },
}

export const Unavailable: Story = {
  args: { start: 'unavailable' },
}
