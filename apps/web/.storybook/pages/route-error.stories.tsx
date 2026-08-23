import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { RouteError } from '@web/ui/components/feedback/route-error.tsx'
import { PublicShell } from '@web/ui/components/layout/public-shell.tsx'

const meta = {
  title: 'Pages/Route error',
  component: RouteError,
  args: {
    error: new Error('Private error detail'),
    reset: () => undefined,
  },
  render: (args) => (
    <PublicShell variant="article">
      <RouteError {...args} />
    </PublicShell>
  ),
} satisfies Meta<typeof RouteError>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
