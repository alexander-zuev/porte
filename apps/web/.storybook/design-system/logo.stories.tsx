import type { Meta, StoryObj } from '@storybook/tanstack-react'

import { Logo } from '#/ui/components/logo.tsx'
import { MarketingFrame } from '#/ui/components/marketing-frame.tsx'

const SIZES = [
  { size: 'sm', note: '18px — page headers, next to 14px nav text' },
  { size: 'md', note: '24px — pairing and sign-in surfaces' },
  { size: 'lg', note: '40px — display lockups' },
] as const

/** Every wordmark size on one board, so the caret can be judged across the scale. */
function LogoBoard() {
  return (
    <MarketingFrame className="flex min-h-svh flex-col justify-center gap-12 px-10 py-16">
      {SIZES.map(({ size, note }) => (
        <div key={size} className="flex flex-col gap-2">
          <Logo size={size} />
          <small className="text-muted-foreground">
            {size} · {note}
          </small>
        </div>
      ))}

      <div className="flex flex-col gap-2 border-t border-border pt-10">
        <div className="flex items-baseline gap-4">
          <Logo size="sm" />
          <span className="text-sm font-medium">Sign in</span>
        </div>
        <small className="text-muted-foreground">
          Against nav text, where the caret is smallest and most likely to break
        </small>
      </div>
    </MarketingFrame>
  )
}

const meta = {
  title: 'Design System/Logo',
  component: LogoBoard,
} satisfies Meta<typeof LogoBoard>

export default meta
type Story = StoryObj<typeof meta>

export const AllSizes: Story = {}
