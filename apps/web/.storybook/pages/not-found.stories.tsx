import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { NotFound } from '@web/ui/components/feedback/not-found.tsx'
import { PublicShell } from '@web/ui/components/layout/public-shell.tsx'

const meta = {
  title: 'Pages/Not found',
  component: NotFound,
  render: () => (
    <PublicShell variant="article">
      <NotFound />
    </PublicShell>
  ),
} satisfies Meta<typeof NotFound>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
