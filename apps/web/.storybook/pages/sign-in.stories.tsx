import type { Meta, StoryObj } from '@storybook/tanstack-react'

import { SignInPage } from '#/pages/sign-in/sign-in-page.tsx'

const meta = {
  title: 'Pages/SignIn',
  component: SignInPage,
} satisfies Meta<typeof SignInPage>

export default meta
type Story = StoryObj<typeof meta>

export const Ready: Story = {
  args: {
    captchaReady: true,
    error: undefined,
    pendingProvider: undefined,
    onSocial: () => undefined,
  },
}

export const Pending: Story = {
  args: {
    captchaReady: true,
    error: undefined,
    pendingProvider: 'github',
    onSocial: () => undefined,
  },
}

export const ErrorState: Story = {
  args: {
    captchaReady: true,
    error: 'Sign-in failed.',
    pendingProvider: undefined,
    onSocial: () => undefined,
  },
}
