import type { Meta, StoryObj } from '@storybook/tanstack-react'

import { LandingPage } from '#/pages/landing/landing-page.tsx'

const meta = {
  title: 'Pages/Landing',
  component: LandingPage,
} satisfies Meta<typeof LandingPage>

export default meta
type Story = StoryObj<typeof meta>

export const Hero: Story = {}
