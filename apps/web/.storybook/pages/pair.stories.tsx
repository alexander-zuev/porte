import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { useState } from 'react'

import { PairPage } from '#/pages/pair/pair-page.tsx'

const HOST = {
  name: "Alex's MacBook Pro",
  platform: 'macOS · Porte CLI',
} as const

const meta = {
  title: 'Pages/Pair',
  component: PairPage,
  args: { view: 'validating' },
} satisfies Meta<typeof PairPage>

export default meta
type Story = StoryObj<typeof meta>

export const Validating: Story = {}

export const SignInRequired: Story = {
  render: () => <PairPage host={HOST} view="sign-in-required" onSignIn={() => undefined} />,
}

export const Confirm: Story = {
  render: () => (
    <PairPage
      accountLabel="a•••@example.com"
      host={HOST}
      pending={false}
      verificationPhrase="quiet cedar seven"
      view="confirm"
      onCancel={() => undefined}
      onConfirm={() => undefined}
    />
  ),
}

export const Confirming: Story = {
  render: () => (
    <PairPage
      accountLabel="a•••@example.com"
      host={HOST}
      pending
      verificationPhrase="quiet cedar seven"
      view="confirm"
      onCancel={() => undefined}
      onConfirm={() => undefined}
    />
  ),
}

export const WaitingForDesktop: Story = {
  render: () => (
    <PairPage
      host={HOST}
      verificationPhrase="quiet cedar seven"
      view="waiting-for-desktop"
      onCancel={() => undefined}
    />
  ),
}

export const Success: Story = {
  render: () => <PairPage host={HOST} view="success" onContinue={() => undefined} />,
}

export const Expired: Story = {
  render: () => <PairPage view="expired" onEnterCode={() => undefined} />,
}

function CodeEntryHarness({ error }: { readonly error?: string }) {
  const [code, setCode] = useState(error === undefined ? '' : 'ZZZZZZ')
  return (
    <PairPage
      code={code}
      error={error}
      pending={false}
      view="code-entry"
      onCodeChange={setCode}
      onSubmit={() => undefined}
    />
  )
}

export const CodeEntry: Story = {
  render: () => <CodeEntryHarness />,
}

export const InvalidCode: Story = {
  render: () => <CodeEntryHarness error="That code is expired or has already been used." />,
}
