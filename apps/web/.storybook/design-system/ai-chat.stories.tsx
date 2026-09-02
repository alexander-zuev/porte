import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { ConversationSkeleton } from '@web/features/conversation/components/conversation-skeleton.tsx'
import type { ConversationPermission } from '@web/features/conversation/hooks/use-answer-permission.ts'
import { AppHeader } from '@web/ui/components/layout/app-header.tsx'
import { AppShell } from '@web/ui/components/layout/app-shell.tsx'
import { Button } from '@web/ui/components/ui/button.tsx'
import type { UIMessage } from 'ai'
import { useEffect, useRef, useState, type ReactNode } from 'react'

import {
  answerStop,
  answerTestsDone,
  answerTestsInterrupted,
  answerTestsRunning,
  answerTestsStopped,
  answerTestsStreaming,
  answerTestsThinking,
  askStop,
  askTests,
  commitPermission,
  donePlan,
  emptyRelayState,
  olderTurns,
  relayState,
  session,
  writeFilePermission,
} from '../fixtures/transcript.ts'
import { ChatFrame, type ChatFrameProps } from '../harnesses/chat-frame.tsx'

/*
 * The conversation screen, one story per thing a reader has to judge.
 *
 * What the screen renders today, and the story that carries it:
 *
 * Transcript
 * - empty state; skeleton while loading; "Earlier messages" → "Reading…"  Empty, Loading, Conversation
 * - prompt bubble; photo tiles and named files above it                     Conversation
 * - answer markdown: bold, lists, a table, inline code, fence with copy     Conversation
 *   and expand (dialog on desktop, sheet on phone)
 * - reasoning: "Thinking" while streaming, "Thought for Ns" after;          Turn, Conversation
 *   on a phone the sheet holds the calls made inside it
 * - tool call row: kind icon, title, state dot (pending, running,           Conversation, Turn
 *   done, failed), `+n −m` on an edit, Parameters and Result under it
 * - a settled run of several calls folds to one line; a single call         Conversation
 *   or a moving run stays open
 * - sources trigger; copy under a settled answer                            Conversation
 * - "Thinking…" shimmer before the first token; streaming text              Turn
 * - scroll-to-bottom; "Grok was unable to finish" under a cut-off answer     Conversation, TurnFailed
 *
 * Above the composer
 * - changes line `2 files · +11 −3`                                         Conversation
 * - plan: steps done / current / pending, streaming while running           Conversation, Turn
 * - permissions: allow outline, reject destructive, dead while answering,   Permission
 *   several stacked
 *
 * Composer
 * - placeholder per state; `+` menu or sheet; model and mode; context       every story, CannotSend
 *   ring with cost; submit control ready / submitted / stop / inert / disabled
 *
 * Not rendered by the screen, so not here: branches, retry, thumbs,
 * elicitations, the language selector, pdf and audio previews.
 */

const READY: ChatFrameProps = {
  messages: session,
  state: relayState,
  permissions: [],
  status: 'ready',
  canSend: true,
  placeholder: 'Message Grok…',
}

/** The finished first turn and the prompt of the second, so a turn can start from them. */
const BEFORE_TESTS: readonly UIMessage[] = [askStop, answerStop, askTests]

function Screen({ children }: { readonly children: ReactNode }) {
  return (
    <AppShell header={<AppHeader />} variant="fill">
      {children}
    </AppShell>
  )
}

/** One timer per story, cleared when the story unmounts. */
function useTimer() {
  const timer = useRef(0)
  useEffect(
    () => () => {
      window.clearTimeout(timer.current)
    },
    [],
  )
  return (after: number, run: () => void) => {
    timer.current = window.setTimeout(run, after)
  }
}

const meta = {
  title: 'Design System/AI/Chat',
  parameters: { layout: 'fullscreen' },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

/** Nothing has been said. The composer is the only thing to do. */
export const Empty: Story = {
  render: () => (
    <Screen>
      <ChatFrame {...READY} messages={[]} state={emptyRelayState} />
    </Screen>
  ),
}

/** The transcript has not arrived. The composer is there, disabled, where it will stay. */
export const Loading: Story = {
  render: () => (
    <Screen>
      <ConversationSkeleton />
    </Screen>
  ),
}

/**
 * Two finished turns, end to end: photos and a log on the prompt; a thought
 * with its reads inside; a failed edit standing alone; three settled calls
 * folded to a line; a fence and inline code in the answer; a source; copy;
 * the changes line and the plan above the composer. "Earlier messages" reads
 * the turn before and prepends it.
 */
export const Conversation: Story = {
  render: () => <ConversationStory />,
}

function ConversationStory() {
  const [older, setOlder] = useState<'offered' | 'reading' | 'shown'>('offered')
  const later = useTimer()
  return (
    <Screen>
      <ChatFrame
        {...READY}
        messages={older === 'shown' ? [...olderTurns, ...session] : session}
        readingOlder={older === 'reading'}
        onReadOlder={
          older === 'shown'
            ? null
            : () => {
                setOlder('reading')
                later(900, () => {
                  setOlder('shown')
                })
              }
        }
      />
    </Screen>
  )
}

const STAGES = ['submitted', 'thinking', 'running', 'streaming', 'done'] as const
type Stage = (typeof STAGES)[number]

/** The second turn at one point between sent and done. */
function turnFrame(stage: Stage): Pick<ChatFrameProps, 'messages' | 'status' | 'state'> {
  if (stage === 'submitted')
    return { messages: BEFORE_TESTS, status: 'submitted', state: relayState }
  if (stage === 'thinking') {
    return {
      messages: [...BEFORE_TESTS, answerTestsThinking],
      status: 'streaming',
      state: relayState,
    }
  }
  if (stage === 'running') {
    return {
      messages: [...BEFORE_TESTS, answerTestsRunning],
      status: 'streaming',
      state: relayState,
    }
  }
  if (stage === 'streaming') {
    return {
      messages: [...BEFORE_TESTS, answerTestsStreaming],
      status: 'streaming',
      state: relayState,
    }
  }
  return {
    messages: [...BEFORE_TESTS, answerTestsDone],
    status: 'ready',
    state: { ...relayState, plans: [donePlan] },
  }
}

/**
 * One turn, at every point between sent and done: the shimmer in the answer's
 * slot, a thought streaming, a command running with its dot, text arriving
 * with Stop in the composer, then the settled answer. Pick a stage in the
 * controls or press Next; Stop goes inert until the Host finishes, then done.
 */
export const Turn: StoryObj<{ stage: Stage }> = {
  args: { stage: 'streaming' },
  argTypes: { stage: { control: 'select', options: STAGES } },
  render: (args) => <TurnStory key={args.stage} initial={args.stage} />,
}

function TurnStory({ initial }: { readonly initial: Stage }) {
  const [stage, setStage] = useState<Stage>(initial)
  const [stopping, setStopping] = useState(false)
  const later = useTimer()
  const next = STAGES[STAGES.indexOf(stage) + 1]
  return (
    <Screen>
      <ChatFrame
        {...READY}
        {...turnFrame(stage)}
        stopping={stopping}
        onStop={() => {
          setStopping(true)
          later(800, () => {
            setStopping(false)
            setStage('done')
          })
        }}
      />
      {/* Story-only: the Host would move the turn on; here the reader does. */}
      <div className="fixed top-24 right-4 z-10 flex items-center gap-2">
        <small className="text-muted-foreground">{stage}</small>
        <Button
          disabled={next === undefined}
          size="sm"
          variant="outline"
          onClick={() => {
            if (next !== undefined) setStage(next)
          }}
        >
          Next
        </Button>
      </div>
    </Screen>
  )
}

/**
 * The agent stopped to ask, twice in one turn. The first question is already
 * answered and waits for the machine, so its buttons are dead; the second still
 * blocks. Answer it and it goes the same way.
 */
export const Permission: Story = {
  render: () => <PermissionStory />,
}

function PermissionStory() {
  const [waiting, setWaiting] = useState<readonly ConversationPermission[]>([
    { permission: commitPermission, answering: true },
    { permission: writeFilePermission, answering: false },
  ])
  const later = useTimer()
  return (
    <Screen>
      <ChatFrame
        {...READY}
        messages={[...BEFORE_TESTS, answerTestsRunning]}
        status="streaming"
        permissions={waiting}
        onAnswer={(one) => {
          const id = one.permission.permissionId
          setWaiting((all) =>
            all.map((each) =>
              each.permission.permissionId === id ? { ...each, answering: true } : each,
            ),
          )
          later(700, () => {
            setWaiting((all) => all.filter((each) => each.permission.permissionId !== id))
          })
        }}
      />
    </Screen>
  )
}

/** The machine closed the socket mid-answer. One line under what arrived says so; the next prompt still works. */
export const TurnFailed: Story = {
  render: () => (
    <Screen>
      <ChatFrame
        {...READY}
        messages={[...BEFORE_TESTS, answerTestsInterrupted]}
        status="error"
        error={new Error('The machine closed the connection while the answer was being written.')}
      />
    </Screen>
  ),
}

/** The reader pressed Stop. The mark is the row's own, so it is still there after a reload. */
export const TurnStopped: Story = {
  render: () => (
    <Screen>
      <ChatFrame {...READY} messages={[...BEFORE_TESTS, answerTestsStopped]} status="ready" />
    </Screen>
  ),
}

const REASONS = ['offline', 'reconnecting', 'stopping'] as const
type Reason = (typeof REASONS)[number]

/** Every way the composer refuses a prompt, with the word in the box that says why. */
function blockedFrame(reason: Reason): Partial<ChatFrameProps> {
  if (reason === 'offline') return { canSend: false, placeholder: 'Your machine is offline' }
  if (reason === 'reconnecting') return { canSend: false, placeholder: 'Reconnecting…' }
  return { messages: [...BEFORE_TESTS, answerTestsStreaming], status: 'streaming', stopping: true }
}

/**
 * Nothing can be sent. Offline and reconnecting kill the composer; stopping
 * keeps it and only holds the Stop control inert until the Host finishes the
 * turn — no spinner, no new words in the box. The reason is a control.
 */
export const CannotSend: StoryObj<{ reason: Reason }> = {
  args: { reason: 'offline' },
  argTypes: { reason: { control: 'select', options: REASONS } },
  render: (args) => (
    <Screen>
      <ChatFrame {...READY} {...blockedFrame(args.reason)} />
    </Screen>
  ),
}
