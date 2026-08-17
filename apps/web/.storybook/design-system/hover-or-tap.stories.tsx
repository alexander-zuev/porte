import { StopIcon } from '@phosphor-icons/react'
import type { Meta, StoryObj } from '@storybook/tanstack-react'

import { Button } from '#/components/ui/button.tsx'
import { AppFrame } from '#/ui/app-frame.tsx'
import { HoverOrTap } from '#/ui/hover-or-tap.tsx'

function TapHint() {
  return (
    <AppFrame className="items-center justify-center px-5">
      <h1 className="sr-only">Tap hint</h1>
      <HoverOrTap label="Stops the current turn">
        <Button aria-label="Stop" size="icon">
          <StopIcon />
        </Button>
      </HoverOrTap>
    </AppFrame>
  )
}

const meta = {
  title: 'Design System/HoverOrTap',
  component: TapHint,
} satisfies Meta<typeof TapHint>

export default meta
type Story = StoryObj<typeof meta>

export const Tap: Story = {}
