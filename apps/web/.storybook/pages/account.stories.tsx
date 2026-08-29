import { HostIdSchema, type PairedHost } from '@porte/core/client'
import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { AccountPage } from '@web/pages/account/account-page.tsx'
import { AppHeader } from '@web/ui/components/layout/app-header.tsx'
import { AppShell } from '@web/ui/components/layout/app-shell.tsx'

const identity = { name: 'Alexander Zuev', email: 'azuevpersonal@gmail.com' }

const neverSeenHost = {
  id: HostIdSchema.parse('01990000-0000-7000-8000-000000000001'),
  name: "Alexander's MacBook Pro",
  platform: 'darwin',
  lastSeenAt: null,
} satisfies PairedHost

const seenHost = {
  name: "Alexander's MacBook Pro",
  platform: 'darwin',
  lastSeenAt: '2026-08-19T14:02:00.000Z',
} as PairedHost

const actions = {
  onUnpair: () => undefined,
  onRequestDelete: () => undefined,
  onCancelDelete: () => undefined,
  onConfirmDelete: () => undefined,
}

const meta = {
  title: 'Pages/Account',
  component: AccountPage,
  parameters: { layout: 'fullscreen' },
  args: { ...actions, identity, connection: 'connected', pending: 'none', deleteConfirming: false },
  render: (args) => (
    <AppShell header={<AppHeader />} variant="scroll">
      <AccountPage {...args} />
    </AppShell>
  ),
} satisfies Meta<typeof AccountPage>

export default meta
type Story = StoryObj<typeof meta>

export const Paired: Story = {
  args: { host: neverSeenHost },
}

export const HostOffline: Story = {
  args: { host: seenHost, connection: 'offline' },
}

export const Unpaired: Story = {}

export const Unpairing: Story = {
  args: { host: neverSeenHost, pending: 'unpair' },
}

/** Deleting asks once, in place, and names what goes. */
export const DeleteConfirmation: Story = {
  args: { host: neverSeenHost, deleteConfirming: true },
}

export const Deleting: Story = {
  args: { host: neverSeenHost, deleteConfirming: true, pending: 'delete' },
}

export const DeleteFailed: Story = {
  args: {
    host: neverSeenHost,
    deleteConfirming: true,
    failure: 'Deleting failed. Your account is unchanged.',
  },
}
