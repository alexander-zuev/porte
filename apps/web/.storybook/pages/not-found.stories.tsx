import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { NotFound } from '@web/ui/components/feedback/not-found.tsx'

/** The router's default fallback: it renders alone, with no shell around it. */
const meta = {
  title: 'Pages/Not found',
  component: NotFound,
} satisfies Meta<typeof NotFound>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
