import { HostIdSchema, IsoDateTimeSchema, type PairedHost } from '@porte/core/client'
import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { AlreadyPaired } from '@web/features/pair/components/already-paired.tsx'
import { AppHeader } from '@web/ui/components/layout/app-header.tsx'
import { AppShell } from '@web/ui/components/layout/app-shell.tsx'

import { PairingPlay } from '../harnesses/pairing-play.tsx'

const pairedHost = {
  id: HostIdSchema.parse('01990000-0000-7000-8000-000000000001'),
  name: "Alexander's MacBook Pro",
  platform: 'darwin',
  lastSeenAt: IsoDateTimeSchema.parse('2026-08-19T14:02:00.000Z'),
  cliVersion: null,
} satisfies PairedHost

const meta = {
  title: 'Pages/Pair',
  component: PairingPlay,
  args: { start: 'code-entry' },
  render: (args) => (
    <AppShell header={<AppHeader />} variant="card">
      <PairingPlay {...args} />
    </AppShell>
  ),
} satisfies Meta<typeof PairingPlay>

export default meta
type Story = StoryObj<typeof meta>

/** The whole journey: type the code, approve it, watch the machine arrive. */
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

/** Paired, machine still offline: the command is the next step. */
export const Approved: Story = {
  args: { start: 'approved' },
}

/** The daemon connected: the relay sees the machine and the card opens the door. */
export const Connected: Story = {
  args: { start: 'connected' },
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

/** `/pair` opened by an account that already has a machine. */
export const AlreadyPairedMachine: Story = {
  render: () => (
    <AppShell header={<AppHeader />} variant="card">
      <AlreadyPaired
        connection="connected"
        host={pairedHost}
        unpairing={false}
        onUnpair={() => undefined}
      />
    </AppShell>
  ),
}
