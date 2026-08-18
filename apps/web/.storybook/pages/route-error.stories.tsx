import type { Meta, StoryObj } from '@storybook/tanstack-react'

import { RouteError } from '#/ui/components/feedback/route-error.tsx'

const meta = {
  title: 'Pages/Route error',
  component: RouteError,
  args: {
    error: new Error('Private error detail'),
    reset: () => undefined,
  },
} satisfies Meta<typeof RouteError>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
