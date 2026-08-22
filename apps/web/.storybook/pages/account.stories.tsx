import type { PairedHost } from '@porte/core/client'
import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { AccountPage } from '@web/pages/account/account-page.tsx'

const identity = { name: 'Alexander Zuev', email: 'azuevpersonal@gmail.com' }

const neverSeenHost = {
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
  onSignOut: () => undefined,
  onRequestDelete: () => undefined,
  onCancelDelete: () => undefined,
  onConfirmDelete: () => undefined,
}

const meta = {
  title: 'Pages/Account',
  component: AccountPage,
  parameters: { layout: 'fullscreen' },
  args: { ...actions, identity, pending: 'none', deleteConfirming: false },
} satisfies Meta<typeof AccountPage>

export default meta
type Story = StoryObj<typeof meta>

export const Paired: Story = {
  args: { host: neverSeenHost },
}

export const HostOffline: Story = {
  args: { host: seenHost },
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

export const SigningOut: Story = {
  args: { host: neverSeenHost, pending: 'signOut' },
}
