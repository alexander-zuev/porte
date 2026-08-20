import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { ConversationPage } from '@web/pages/conversation/conversation-page.tsx'
import type { ConversationPageProps } from '@web/pages/conversation/conversation-page.tsx'
import { useState } from 'react'

import {
  formElicitation,
  longMessageItems,
  markdownItems,
  pendingPermission,
  reasoningItems,
  conversations,
  listResume,
  streamingItems,
  toolsItems,
  urlElicitation,
  userOnlyItems,
} from '../fixtures/conversations.ts'

const meta = {
  title: 'Pages/Conversation',
  component: ConversationPage,
} satisfies Meta<typeof ConversationPage>

export default meta
type Story = StoryObj<typeof meta>

function ConversationHarness(
  props: Pick<
    Extract<ConversationPageProps, { view: 'ready' }>,
    'connection' | 'control' | 'items' | 'draft'
  >,
) {
  const [draft, setDraft] = useState(props.draft)
  return (
    <ConversationPage
      actions={{
        ...actions,
        onDraftChange: setDraft,
      }}
      connection={props.connection}
      control={props.control}
      draft={draft}
      hostName="Alexander's MacBook Pro"
      items={props.items}
      conversation={listResume}
      view="ready"
    />
  )
}

const actions = {
  onAnswerElicitation: () => undefined,
  onAnswerPermission: () => undefined,
  onBack: () => undefined,
  onDraftChange: () => undefined,
  onElicitationValueChange: () => undefined,
  onOpenElicitationUrl: () => undefined,
  onRetryPermission: () => undefined,
  onSend: () => undefined,
  onStop: () => undefined,
  onSubmitElicitation: () => undefined,
}

const idleArgs = {
  actions,
  view: 'ready' as const,
  conversation: listResume,
  hostName: "Alexander's MacBook Pro",
  connection: 'online' as const,
  control: { state: 'idle' as const },
  items: streamingItems,
  draft: '',
}

export const Empty: Story = {
  args: idleArgs,
  render: () => (
    <ConversationHarness connection="online" control={{ state: 'idle' }} draft="" items={[]} />
  ),
}

export const UserOnly: Story = {
  args: idleArgs,
  render: () => (
    <ConversationHarness
      connection="online"
      control={{ state: 'idle' }}
      draft=""
      items={userOnlyItems}
    />
  ),
}

export const MarkdownReply: Story = {
  args: idleArgs,
  render: () => (
    <ConversationHarness
      connection="online"
      control={{ state: 'idle' }}
      draft=""
      items={markdownItems}
    />
  ),
}

export const ReasoningOpen: Story = {
  args: idleArgs,
  render: () => (
    <ConversationHarness
      connection="online"
      control={{ state: 'idle' }}
      draft=""
      items={reasoningItems}
    />
  ),
}

export const Tools: Story = {
  args: idleArgs,
  render: () => (
    <ConversationHarness
      connection="online"
      control={{ state: 'running' }}
      draft=""
      items={toolsItems}
    />
  ),
}

export const StreamingTurn: Story = {
  args: idleArgs,
  render: () => (
    <ConversationHarness
      draft=""
      connection="online"
      control={{ state: 'running' }}
      items={streamingItems}
    />
  ),
}

export const Permission: Story = {
  args: idleArgs,
  render: () => (
    <ConversationHarness
      draft=""
      connection="online"
      control={{
        state: 'permission',
        decision: { state: 'pending', request: pendingPermission },
      }}
      items={streamingItems}
    />
  ),
}

export const LongMessage: Story = {
  args: idleArgs,
  render: () => (
    <ConversationHarness
      connection="online"
      control={{ state: 'idle' }}
      draft=""
      items={longMessageItems}
    />
  ),
}

export const Idle: Story = {
  args: idleArgs,
  render: () => (
    <ConversationHarness
      draft="Add cancel next."
      connection="online"
      control={{ state: 'idle' }}
      items={streamingItems}
    />
  ),
}

export const Offline: Story = {
  args: idleArgs,
  render: () => (
    <ConversationHarness
      draft=""
      connection="offline"
      control={{ state: 'idle' }}
      items={streamingItems}
    />
  ),
}

export const Reconnecting: Story = {
  args: idleArgs,
  render: () => (
    <ConversationHarness
      connection="reconnecting"
      control={{ state: 'running' }}
      draft="Keep this draft while the connection returns"
      items={streamingItems}
    />
  ),
}

export const Sending: Story = {
  args: idleArgs,
  render: () => (
    <ConversationHarness
      connection="online"
      control={{ state: 'sending' }}
      draft="Add a health check"
      items={streamingItems}
    />
  ),
}

export const DeliveryUnknown: Story = {
  args: idleArgs,
  render: () => (
    <ConversationHarness
      connection="reconnecting"
      control={{ state: 'delivery-unknown' }}
      draft="Add a health check"
      items={streamingItems}
    />
  ),
}

export const Stopping: Story = {
  args: idleArgs,
  render: () => (
    <ConversationHarness
      connection="online"
      control={{ state: 'stopping' }}
      draft=""
      items={streamingItems}
    />
  ),
}

export const Completed: Story = {
  args: idleArgs,
  render: () => (
    <ConversationHarness
      connection="online"
      control={{ state: 'completed' }}
      draft=""
      items={streamingItems}
    />
  ),
}

export const TurnFailed: Story = {
  args: idleArgs,
  render: () => (
    <ConversationHarness
      connection="online"
      control={{
        state: 'failed',
        error: { code: 'INTERNAL_ERROR', message: 'Grok stopped before it completed the turn.' },
      }}
      draft="Add a health check"
      items={streamingItems}
    />
  ),
}

export const ElicitationForm: Story = {
  args: idleArgs,
  render: () => (
    <ConversationHarness
      connection="online"
      control={{
        state: 'elicitation',
        decision: {
          request: formElicitation,
          response: { state: 'pending' },
          values: { environment: 'Preview', retries: '3', include_logs: false },
          errors: {},
        },
      }}
      draft=""
      items={streamingItems}
    />
  ),
}

export const ElicitationUrl: Story = {
  args: idleArgs,
  render: () => (
    <ConversationHarness
      connection="online"
      control={{
        state: 'elicitation',
        decision: {
          request: urlElicitation,
          response: { state: 'pending' },
          values: {},
          errors: {},
        },
      }}
      draft=""
      items={streamingItems}
    />
  ),
}

export const Opening: Story = {
  args: {
    hostName: "Alexander's MacBook Pro",
    conversation: listResume,
    view: 'opening',
    onBack: () => undefined,
  },
}

export const ConversationUnavailable: Story = {
  args: {
    hostName: "Alexander's MacBook Pro",
    reason: 'unavailable',
    conversation: listResume,
    view: 'failure',
    onBack: () => undefined,
    onRetry: () => undefined,
  },
}

export const AgentFailed: Story = {
  args: {
    hostName: "Alexander's MacBook Pro",
    reason: 'agent-failed',
    conversation: listResume,
    view: 'failure',
    onBack: () => undefined,
    onRetry: () => undefined,
  },
}

export const HostDisconnectedWhileOpening: Story = {
  args: {
    hostName: "Alexander's MacBook Pro",
    reason: 'host-offline',
    conversation: listResume,
    view: 'failure',
    onBack: () => undefined,
  },
}
