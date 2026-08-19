import type { Meta, StoryObj } from '@storybook/tanstack-react'

import { PairingPlay } from '../harnesses/pairing-play.tsx'

const meta = {
  title: 'Pages/Pair',
  component: PairingPlay,
  args: { start: 'validating' },
} satisfies Meta<typeof PairingPlay>

export default meta
type Story = StoryObj<typeof meta>

export const Interactive: Story = {
  args: { start: 'validating', simulateRemote: true },
}

export const Validating: Story = {
  args: { start: 'validating' },
}

export const Confirm: Story = {
  args: { start: 'confirm' },
}

export const Confirming: Story = {
  args: { start: 'confirming' },
}

export const WaitingForDesktop: Story = {
  args: { start: 'waiting-for-desktop' },
}

export const Success: Story = {
  args: { start: 'success' },
}

export const Expired: Story = {
  args: { start: 'expired' },
}

export const CodeEntry: Story = {
  args: { start: 'code-entry' },
}

export const InvalidCode: Story = {
  args: { start: 'invalid-code' },
}

export const ConfirmationMismatch: Story = {
  args: { start: 'confirmation-mismatch' },
}

export const AlreadyConsumed: Story = {
  args: { start: 'consumed' },
}

export const AccountConflict: Story = {
  args: { start: 'account-conflict' },
}

export const HostDisconnected: Story = {
  args: { start: 'host-disconnected' },
}

export const ServerUnavailable: Story = {
  args: { start: 'server-unavailable' },
}
