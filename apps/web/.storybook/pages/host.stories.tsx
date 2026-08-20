import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { HostPage } from '@web/pages/host/host-page.tsx'

const HOST = {
  name: "Alexander's MacBook Pro",
  platform: 'darwin',
} as const

const actions = {
  host: HOST,
  onBack: () => undefined,
  onRepair: () => undefined,
  onRevoke: () => undefined,
} as const

const meta = {
  title: 'Pages/Host',
  component: HostPage,
} satisfies Meta<typeof HostPage>

export default meta
type Story = StoryObj<typeof meta>

export const Online: Story = {
  args: { ...actions, state: 'online' },
}

export const Offline: Story = {
  args: { ...actions, state: 'offline', lastSeen: '12 minutes ago' },
}

export const CredentialRejected: Story = {
  args: { ...actions, state: 'credential-rejected' },
}

export const PairAgainRequired: Story = {
  args: { ...actions, state: 'repair-required' },
}

export const Revoking: Story = {
  args: { ...actions, state: 'revoking' },
}

export const Revoked: Story = {
  args: {
    state: 'revoked',
    hostName: HOST.name,
    onBack: () => undefined,
    onPair: () => undefined,
  },
}
