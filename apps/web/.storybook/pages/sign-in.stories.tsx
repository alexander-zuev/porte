import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { PairingSignInNotice } from '@web/features/auth/components/pairing-sign-in-notice.tsx'
import { SignInPage } from '@web/pages/sign-in/sign-in-page.tsx'
import { Button } from '@web/ui/components/ui/button.tsx'
import { toast } from '@web/ui/components/ui/sonner.tsx'

import { PairingPlay, SignInPlay } from '../harnesses/pairing-play.tsx'

const meta = {
  title: 'Pages/SignIn',
  component: SignInPage,
} satisfies Meta<typeof SignInPage>

export default meta
type Story = StoryObj<typeof meta>

// The harness owns its own state, so the args exist only to satisfy the props.
const UNUSED = { pendingProvider: undefined, onSocial: () => undefined }

export const Ready: Story = {
  args: UNUSED,
  render: () => <SignInPlay />,
}

export const PairingRedirect: Story = {
  args: UNUSED,
  render: () => <PairingPlay start="sign-in" />,
}

export const Pending: Story = {
  args: {
    pendingProvider: 'google',
    onSocial: () => undefined,
  },
}

/** A returning visitor: the cookie from the last sign-in marks the provider to reuse. */
export const LastUsed: Story = {
  args: {
    lastMethod: 'google',
    pendingProvider: undefined,
    onSocial: () => undefined,
  },
}

export const WithPairingNotice: Story = {
  args: {
    notice: <PairingSignInNotice />,
    pendingProvider: undefined,
    onSocial: () => undefined,
  },
}

/** Failures leave the column untouched and raise a toast instead. */
export const FailureToast: Story = {
  args: {
    pendingProvider: undefined,
    onSocial: () => undefined,
    children: (
      <Button
        variant="outline"
        onClick={() => {
          toast.error('Sign-in failed', { description: 'Try again in a moment.' })
        }}
      >
        Raise the failure toast
      </Button>
    ),
  },
}
