import type { Meta, StoryObj } from '@storybook/tanstack-react'
import {
  NewConversationPage,
  type NewConversationPageProps,
} from '@web/pages/new-conversation/new-conversation-page.tsx'
import { AppHeader } from '@web/ui/components/layout/app-header.tsx'
import { AppShell } from '@web/ui/components/layout/app-shell.tsx'
import { useState } from 'react'

const HOST_NAME = "Alexander's MacBook Pro"
const REPOSITORIES = ['/Users/az/projects/porte', '/Users/az/projects/typist'] as const

const meta = {
  title: 'Pages/New Conversation',
  component: NewConversationPage,
  render: (args) => <NewConversationStoryPage {...args} />,
} satisfies Meta<typeof NewConversationPage>

export default meta
type Story = StoryObj<NewConversationPageProps>

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

function NewConversationStoryPage(props: NewConversationPageProps) {
  return (
    <AppShell header={<AppHeader />} variant="scroll">
      <NewConversationPage {...props} />
    </AppShell>
  )
}

function ConversationFormPage({
  state,
}: {
  readonly state: 'ready' | 'offline' | 'creating' | 'opening' | 'failed' | 'unknown'
}) {
  return (
    <AppShell header={<AppHeader />} variant="scroll">
      <ConversationFormStory state={state} />
    </AppShell>
  )
}

export const Ready: Story = {
  args: UNUSED,
  render: () => <ConversationFormPage state="ready" />,
}

export const LoadingRepositories: Story = {
  args: { hostName: HOST_NAME, view: 'loading', onBack: () => undefined },
}

export const NoKnownRepositories: Story = {
  args: { hostName: HOST_NAME, view: 'empty', onBack: () => undefined },
}

export const HostOffline: Story = {
  args: UNUSED,
  render: () => <ConversationFormPage state="offline" />,
}

export const Creating: Story = {
  args: UNUSED,
  render: () => <ConversationFormPage state="creating" />,
}

export const CreatedAndOpening: Story = {
  args: UNUSED,
  render: () => <ConversationFormPage state="opening" />,
}

export const CreationFailed: Story = {
  args: UNUSED,
  render: () => <ConversationFormPage state="failed" />,
}

export const CreationUnknown: Story = {
  args: UNUSED,
  render: () => <ConversationFormPage state="unknown" />,
}
