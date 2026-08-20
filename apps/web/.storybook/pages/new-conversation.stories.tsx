import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { NewConversationPage } from '@web/pages/new-conversation/new-conversation-page.tsx'
import { useState } from 'react'

const HOST_NAME = "Alexander's MacBook Pro"
const REPOSITORIES = ['/Users/az/projects/porte', '/Users/az/projects/typist'] as const

const meta = {
  title: 'Pages/New Conversation',
  component: NewConversationPage,
} satisfies Meta<typeof NewConversationPage>

export default meta
type Story = StoryObj<typeof meta>

// The wrapper owns its own state, so the args exist only to satisfy the props.
const UNUSED = { hostName: HOST_NAME, view: 'loading', onBack: () => undefined } as const

function ConversationFormStory({
  state,
}: {
  readonly state: 'ready' | 'offline' | 'creating' | 'opening' | 'failed' | 'unknown'
}) {
  const [cwd, setCwd] = useState<string>(REPOSITORIES[0])
  const [prompt, setPrompt] = useState('Review the authentication flow and fix the failing tests')
  return (
    <NewConversationPage
      cwd={cwd}
      hostName={HOST_NAME}
      prompt={prompt}
      repositories={REPOSITORIES}
      state={{ status: state }}
      view="form"
      onBack={() => undefined}
      onCheckConversations={() => undefined}
      onPromptChange={setPrompt}
      onRepositoryChange={setCwd}
      onSubmit={() => undefined}
    />
  )
}

export const Ready: Story = {
  args: UNUSED,
  render: () => <ConversationFormStory state="ready" />,
}

export const LoadingRepositories: Story = {
  args: { hostName: HOST_NAME, view: 'loading', onBack: () => undefined },
}

export const NoKnownRepositories: Story = {
  args: { hostName: HOST_NAME, view: 'empty', onBack: () => undefined },
}

export const HostOffline: Story = {
  args: UNUSED,
  render: () => <ConversationFormStory state="offline" />,
}

export const Creating: Story = {
  args: UNUSED,
  render: () => <ConversationFormStory state="creating" />,
}

export const CreatedAndOpening: Story = {
  args: UNUSED,
  render: () => <ConversationFormStory state="opening" />,
}

export const CreationFailed: Story = {
  args: UNUSED,
  render: () => <ConversationFormStory state="failed" />,
}

export const CreationUnknown: Story = {
  args: UNUSED,
  render: () => <ConversationFormStory state="unknown" />,
}
