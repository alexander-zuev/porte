import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { useState } from 'react'

import { NewSessionPage } from '#/pages/new-session/new-session-page.tsx'

const HOST_NAME = "Alexander's MacBook Pro"
const REPOSITORIES = ['/Users/az/projects/porte', '/Users/az/projects/typist'] as const

const meta = {
  title: 'Pages/New Session',
  component: NewSessionPage,
} satisfies Meta<typeof NewSessionPage>

export default meta
type Story = StoryObj<typeof meta>

function SessionFormStory({ state }: { readonly state: 'ready' | 'offline' | 'creating' | 'opening' | 'failed' | 'unknown' }) {
  const [cwd, setCwd] = useState<string>(REPOSITORIES[0])
  const [prompt, setPrompt] = useState('Review the authentication flow and fix the failing tests')
  return (
    <NewSessionPage
      cwd={cwd}
      hostName={HOST_NAME}
      prompt={prompt}
      repositories={REPOSITORIES}
      state={{ status: state }}
      view="form"
      onBack={() => undefined}
      onCheckSessions={() => undefined}
      onPromptChange={setPrompt}
      onRepositoryChange={setCwd}
      onSubmit={() => undefined}
    />
  )
}

export const Ready: Story = {
  render: () => <SessionFormStory state="ready" />,
}

export const LoadingRepositories: Story = {
  args: { hostName: HOST_NAME, view: 'loading', onBack: () => undefined },
}

export const NoKnownRepositories: Story = {
  args: { hostName: HOST_NAME, view: 'empty', onBack: () => undefined },
}

export const HostOffline: Story = {
  render: () => <SessionFormStory state="offline" />,
}

export const Creating: Story = {
  render: () => <SessionFormStory state="creating" />,
}

export const CreatedAndOpening: Story = {
  render: () => <SessionFormStory state="opening" />,
}

export const CreationFailed: Story = {
  render: () => <SessionFormStory state="failed" />,
}

export const CreationUnknown: Story = {
  render: () => <SessionFormStory state="unknown" />,
}
