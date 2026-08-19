import type { Meta, StoryObj } from '@storybook/tanstack-react'

import { SignInPage } from '#/pages/sign-in/sign-in-page.tsx'

import { PairingPlay, SignInPlay } from '../harnesses/pairing-play.tsx'

const meta = {
  title: 'Pages/SignIn',
  component: SignInPage,
} satisfies Meta<typeof SignInPage>

export default meta
type Story = StoryObj<typeof meta>

export const Ready: Story = {
  render: () => <SignInPlay />,
}

export const PairingRedirect: Story = {
  render: () => <PairingPlay start="sign-in" />,
}

export const Pending: Story = {
  args: {
    error: undefined,
    pendingProvider: 'google',
    onSocial: () => undefined,
  },
}

export const ErrorState: Story = {
  args: {
    error: 'Sign-in failed',
    pendingProvider: undefined,
    onSocial: () => undefined,
  },
}
