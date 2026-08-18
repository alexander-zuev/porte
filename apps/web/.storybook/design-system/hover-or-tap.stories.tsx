import { StopIcon } from '@phosphor-icons/react'
import type { Meta, StoryObj } from '@storybook/tanstack-react'

import { HoverOrTap } from '#/ui/components/hover-or-tap.tsx'
import { MarketingFrame } from '#/ui/components/marketing-frame.tsx'
import { Button } from '#/ui/components/ui/button.tsx'

function TapHint() {
  return (
    <MarketingFrame className="flex items-center justify-center px-5">
      <h1 className="sr-only">Tap hint</h1>
      <HoverOrTap label="Stops the current turn">
        <Button aria-label="Stop" size="icon">
          <StopIcon />
        </Button>
      </HoverOrTap>
    </MarketingFrame>
  )
}

const meta = {
  title: 'Design System/HoverOrTap',
  component: TapHint,
} satisfies Meta<typeof TapHint>

export default meta
type Story = StoryObj<typeof meta>

export const Tap: Story = {}
