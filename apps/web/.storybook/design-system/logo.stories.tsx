import type { Meta, StoryObj } from '@storybook/tanstack-react'

import { Logo } from '#/ui/components/logo.tsx'
import { MarketingFrame } from '#/ui/components/marketing-frame.tsx'

function LogoBoard({ size }: { readonly size: 'sm' | 'md' | 'lg' }) {
  return (
    <MarketingFrame className="flex min-h-svh flex-col items-center justify-center gap-3 px-5">
      <Logo size={size} />
      <small className="text-muted-foreground">{size}</small>
    </MarketingFrame>
  )
}

const meta = {
  title: 'Design System/Logo',
  component: LogoBoard,
  args: { size: 'md' },
} satisfies Meta<typeof LogoBoard>

export default meta
type Story = StoryObj<typeof meta>

export const Compact: Story = {
  args: { size: 'sm' },
}

export const Default: Story = {
  args: { size: 'md' },
}

export const Display: Story = {
  args: { size: 'lg' },
}
