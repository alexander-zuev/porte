import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { ConversationSkeleton } from '@web/features/conversation/components/conversation-skeleton.tsx'
import { AppHeader } from '@web/ui/components/layout/app-header.tsx'
import { AppShell } from '@web/ui/components/layout/app-shell.tsx'
import type { ReactNode } from 'react'

import {
  answerRelay,
  answerStreaming,
  askFollowUp,
  askRelay,
  askWithFile,
  emptyRelayState,
  filePlan,
  itemsPlan,
  longTranscript,
  markdownPlan,
  relayState,
  runTestsPermission,
  toolDiff,
  toolFailed,
  toolRunDone,
  toolRunning,
  transcript,
  writeFilePermission,
} from '../fixtures/transcript.ts'
import { ChatFrame, type ChatFrameProps } from '../harnesses/chat-frame.tsx'

/** Every story starts here and changes one thing, so the difference is the state. */
const READY: ChatFrameProps = {
  messages: transcript,
  state: relayState,
  permissions: [],
  status: 'ready',
  canSend: true,
  placeholder: 'Message Grok…',
}

function Screen({ children }: { readonly children: ReactNode }) {
  return (
    <AppShell header={<AppHeader />} variant="fill">
      {children}
    </AppShell>
  )
}

function chat(state: Partial<ChatFrameProps>) {
  return () => (
    <Screen>
      <ChatFrame {...READY} {...state} />
    </Screen>
  )
}

const meta = {
  title: 'Design System/AI/Chat states',
  parameters: { layout: 'fullscreen' },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

/** Nothing has been said. The composer is the only thing to do. */
export const Empty: Story = {
  render: chat({ messages: [], state: emptyRelayState }),
}

/** The transcript is still being read, so nothing can be sent into it yet. */
export const Reading: Story = {
  render: () => (
    <Screen>
      <ConversationSkeleton />
    </Screen>
  ),
}

/** The turn finished. Everything on the screen is final. */
export const Ready: Story = { render: chat({}) }

/** The answer is being written. The submit control stops it instead. */
export const Running: Story = {
  render: chat({ messages: [...transcript, answerStreaming], status: 'streaming' }),
}

/** The prompt is sent and the first token has not arrived. */
export const Submitted: Story = {
  render: chat({ messages: [...transcript, askFollowUp], status: 'submitted' }),
}

/** Every plan shape at once: a checklist, written steps, and a file on the Mac. */
export const WithPlan: Story = {
  render: chat({ state: { ...relayState, plans: [itemsPlan, markdownPlan, filePlan] } }),
}

/** No plan was reported, so nothing sits between transcript and composer. */
export const WithoutPlan: Story = {
  render: chat({ state: { ...relayState, plans: [] } }),
}

/** The agent stopped to ask. Until this is answered the turn goes nowhere. */
export const AwaitingPermission: Story = {
  render: chat({
    messages: [...transcript, toolRunning],
    status: 'submitted',
    permissions: [{ permission: runTestsPermission, answering: false }],
  }),
}

/** The answer is sent and the buttons are dead until the Mac replies. */
export const AnsweringPermission: Story = {
  render: chat({
    messages: [...transcript, toolRunning],
    status: 'submitted',
    permissions: [{ permission: runTestsPermission, answering: true }],
  }),
}

/** Two questions are waiting. Both block the same turn. */
export const TwoPermissions: Story = {
  render: chat({
    messages: [...transcript, toolRunning],
    status: 'submitted',
    permissions: [
      { permission: runTestsPermission, answering: false },
      { permission: writeFilePermission, answering: false },
    ],
  }),
}

/** The turn stopped on its own. What it already said is still readable. */
export const TurnFailed: Story = {
  render: chat({
    messages: [...transcript, answerStreaming],
    status: 'error',
    error: new Error('The Mac closed the connection while the answer was being written.'),
  }),
}

/** The Mac is away. The composer does not accept work. */
export const MacOffline: Story = {
  render: chat({ canSend: false, placeholder: 'Your Mac is offline' }),
}

/** The socket is coming back. Same screen, different reason to wait. */
export const Reconnecting: Story = {
  render: chat({ canSend: false, placeholder: 'Reconnecting…' }),
}

/**
 * Two finished answers, end to end: a thought with the call it made (a sheet
 * on a phone), a fence in the same block a tool uses, inline code in colour,
 * a folded run, the changes line above the composer, and copy under each.
 */
export const Answered: Story = {
  render: chat({ messages: [askRelay, answerRelay, toolRunDone] }),
}

/** A finished run folded to a line; then one call running, one failed, one that edited. */
export const ToolCalls: Story = {
  render: chat({ messages: [askRelay, toolRunDone, toolRunning, toolFailed, toolDiff] }),
}

/** A file went up with the prompt and the answer cites what it read. */
export const FilesAndSources: Story = {
  render: chat({ messages: [askWithFile, answerRelay] }),
}

/** Older turns exist. The transcript scrolls and offers to read back. */
export const LongTranscript: Story = {
  render: chat({ messages: longTranscript, onReadOlder: () => undefined }),
}

/** The earlier turns are being fetched. */
export const ReadingOlder: Story = {
  render: chat({ messages: longTranscript, onReadOlder: () => undefined, readingOlder: true }),
}
