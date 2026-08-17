import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { useState, type ComponentProps } from 'react'

import { SignInPage } from '#/features/auth/components/sign-in-page.tsx'

const meta = {
  title: 'Pages/SignIn',
  component: SignInPage,
} satisfies Meta<typeof SignInPage>

export default meta
type Story = StoryObj<typeof meta>

function SignInHarness(props: Pick<ComponentProps<typeof SignInPage>, 'pending' | 'error'>) {
  const [email, setEmail] = useState('az@example.com')
  const [password, setPassword] = useState('password')
  return (
    <SignInPage
      email={email}
      password={password}
      pending={props.pending}
      error={props.error}
      onEmailChange={setEmail}
      onPasswordChange={setPassword}
      onSubmit={() => undefined}
    />
  )
}

export const Ready: Story = {
  args: {
    email: 'az@example.com',
    password: 'password',
    pending: false,
    error: undefined,
    onEmailChange: () => undefined,
    onPasswordChange: () => undefined,
    onSubmit: () => undefined,
  },
  render: () => <SignInHarness pending={false} error={undefined} />,
}

export const Pending: Story = {
  args: Ready.args,
  render: () => <SignInHarness pending error={undefined} />,
}

export const ErrorState: Story = {
  args: Ready.args,
  render: () => <SignInHarness pending={false} error="Wrong email or password." />,
}
