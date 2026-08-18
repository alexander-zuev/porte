import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { useState } from 'react'

import { ConversationPage } from '#/pages/conversation/conversation-page.tsx'
import type { ConversationPageProps } from '#/pages/conversation/conversation-page.tsx'

import {
  longMessageItems,
  markdownItems,
  permissionRequest,
  reasoningItems,
  streamingItems,
  toolsItems,
  userOnlyItems,
} from '../fixtures/sessions.ts'

const meta = {
  title: 'Pages/Session',
  component: ConversationPage,
} satisfies Meta<typeof ConversationPage>

export default meta
type Story = StoryObj<typeof meta>

function SessionHarness(
  props: Pick<ConversationPageProps, 'online' | 'status' | 'items' | 'permission' | 'draft'>,
) {
  const [draft, setDraft] = useState(props.draft)
  return (
    <ConversationPage
      draft={draft}
      items={props.items}
      onAnswerPermission={() => undefined}
      onDraftChange={setDraft}
      onSend={() => undefined}
      onStop={() => undefined}
      online={props.online}
      permission={props.permission}
      status={props.status}
      title="Daemon list and resume"
    />
  )
}

const idleArgs = {
  title: 'Daemon list and resume',
  online: true,
  status: 'idle' as const,
  items: streamingItems,
  draft: '',
  permission: undefined,
  onDraftChange: () => undefined,
  onSend: () => undefined,
  onStop: () => undefined,
  onAnswerPermission: () => undefined,
}

export const Empty: Story = {
  args: idleArgs,
  render: () => <SessionHarness draft="" items={[]} online permission={undefined} status="idle" />,
}

export const UserOnly: Story = {
  args: idleArgs,
  render: () => (
    <SessionHarness draft="" items={userOnlyItems} online permission={undefined} status="idle" />
  ),
}

export const MarkdownReply: Story = {
  args: idleArgs,
  render: () => (
    <SessionHarness draft="" items={markdownItems} online permission={undefined} status="idle" />
  ),
}

export const ReasoningOpen: Story = {
  args: idleArgs,
  render: () => (
    <SessionHarness draft="" items={reasoningItems} online permission={undefined} status="idle" />
  ),
}

export const Tools: Story = {
  args: idleArgs,
  render: () => (
    <SessionHarness draft="" items={toolsItems} online permission={undefined} status="streaming" />
  ),
}

export const StreamingTurn: Story = {
  args: idleArgs,
  render: () => (
    <SessionHarness
      draft=""
      items={streamingItems}
      online
      permission={undefined}
      status="streaming"
    />
  ),
}

export const Permission: Story = {
  args: idleArgs,
  render: () => (
    <SessionHarness
      draft=""
      items={streamingItems}
      online
      permission={permissionRequest}
      status="permission"
    />
  ),
}

export const LongMessage: Story = {
  args: idleArgs,
  render: () => (
    <SessionHarness draft="" items={longMessageItems} online permission={undefined} status="idle" />
  ),
}

export const Idle: Story = {
  args: idleArgs,
  render: () => (
    <SessionHarness
      draft="Add cancel next."
      items={streamingItems}
      online
      permission={undefined}
      status="idle"
    />
  ),
}

export const Offline: Story = {
  args: idleArgs,
  render: () => (
    <SessionHarness
      draft=""
      items={streamingItems}
      online={false}
      permission={undefined}
      status="idle"
    />
  ),
}
