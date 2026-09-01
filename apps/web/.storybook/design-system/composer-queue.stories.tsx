import { arrayMove } from '@dnd-kit/sortable'
import { MessageIdSchema, createMessageId } from '@porte/core/client'
import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { ComposerQueue } from '@web/features/conversation/components/composer-queue.tsx'
import type { QueuedMessage } from '@web/features/conversation/models/message-queue.ts'
import {
  PromptInputProvider,
  type PromptInputMessage,
} from '@web/ui/components/ai-elements/prompt-input.tsx'
import { AppHeader } from '@web/ui/components/layout/app-header.tsx'
import { AppShell } from '@web/ui/components/layout/app-shell.tsx'
import type { UIMessage } from 'ai'
import { useState } from 'react'
import { INITIAL_VIEWPORTS } from 'storybook/viewport'

import { answerTestsStreaming, askTests, olderTurns, relayState } from '../fixtures/transcript.ts'
import { ChatFrame } from '../harnesses/chat-frame.tsx'

/*
 * Queued messages, low-fi. Spec: docs/queued-messages.md.
 *
 * - a turn runs: Enter queues, the pill above the composer counts
 * - the pill opens the queue sheet: run order, Send now, Remove
 * - Send now puts that one message in the transcript and the turn goes on
 * - Stop ends the turn; the queue folds into one user message and starts
 */

const meta = {
  title: 'Design System/AI/Composer Queue',
  parameters: { layout: 'fullscreen', viewport: { options: INITIAL_VIEWPORTS } },
} satisfies Meta

export default meta

const SEED: readonly QueuedMessage[] = [
  {
    id: MessageIdSchema.parse('queued-1'),
    position: 1,
    text: 'Then update the changelog with what the tests cover. Keep the entries short: one line per behaviour, no implementation detail, and link the relay doc where the turn rules changed.',
    files: 0,
  },
  { id: MessageIdSchema.parse('queued-2'), position: 2, text: 'Bump the version', files: 1 },
]

/** A turn runs and two messages wait. Every control is live. */
export const Queued: StoryObj = { render: () => <QueueHarness /> }

/** The sheet, open. */
export const QueueOpen: StoryObj = { render: () => <QueueHarness defaultOpen /> }

function QueueHarness({ defaultOpen = false }: { readonly defaultOpen?: boolean }) {
  const [messages, setMessages] = useState<readonly UIMessage[]>(() => [
    ...olderTurns,
    askTests,
    answerTestsStreaming,
  ])
  const [queued, setQueued] = useState(SEED)
  const [running, setRunning] = useState(true)

  /** The turn ended: everything queued folds into one message and starts. */
  const drain = (rows: readonly QueuedMessage[]) => {
    if (rows.length === 0) {
      setRunning(false)
      return
    }
    setMessages((current) => [...stopAll(current), userRow(rows), streamingRow()])
    setQueued([])
    setRunning(true)
  }

  return (
    <PromptInputProvider>
      <AppShell header={<AppHeader />} variant="fill">
        <ChatFrame
          canSend
          messages={messages}
          permissions={[]}
          placeholder={running ? 'Queue for after this turn…' : 'Message Grok…'}
          queue={
            <ComposerQueue
              actions={{
                sendNow: (id) => {
                  const row = queued.find((message) => message.id === id)
                  if (row === undefined) return
                  setQueued((current) => renumber(current.filter((entry) => entry.id !== id)))
                  setMessages((current) => [...stopAll(current), userRow([row]), streamingRow()])
                  setRunning(true)
                },
                remove: (id) => {
                  setQueued((current) => renumber(current.filter((entry) => entry.id !== id)))
                },
                reorder: (id, position) => {
                  setQueued((current) => {
                    const from = current.findIndex((entry) => entry.id === id)
                    if (from === -1) return current
                    return renumber(arrayMove([...current], from, position - 1))
                  })
                },
              }}
              defaultOpen={defaultOpen}
              queued={queued}
            />
          }
          state={{ ...relayState, plans: [] }}
          status={running ? 'streaming' : 'ready'}
          onQueue={(message) => {
            setQueued((current) => [...current, queuedFrom(message, current.length + 1)])
          }}
          onSend={(message) => {
            drain([queuedFrom(message, 1)])
          }}
          onStop={() => {
            drain(queued)
          }}
        />
      </AppShell>
    </PromptInputProvider>
  )
}

function queuedFrom(message: PromptInputMessage, position: number): QueuedMessage {
  return { id: createMessageId(), position, text: message.text, files: message.files.length }
}

function renumber(rows: readonly QueuedMessage[]): readonly QueuedMessage[] {
  return rows.map((row, index) => ({ ...row, position: index + 1 }))
}

/** All at once: the queued messages fold into one user message, parts joined by a blank line. */
function userRow(rows: readonly QueuedMessage[]): UIMessage {
  return {
    id: rows[0]?.id ?? createMessageId(),
    role: 'user',
    parts: [{ type: 'text', text: rows.map((row) => row.text).join('\n\n') }],
  }
}

let answers = 0
function streamingRow(): UIMessage {
  answers += 1
  return {
    id: `answer-${String(answers)}`,
    role: 'assistant',
    parts: [{ type: 'text', text: 'On it.', state: 'streaming' }],
  }
}

function stopAll(rows: readonly UIMessage[]): readonly UIMessage[] {
  return rows.map((row) => ({
    ...row,
    parts: row.parts.map((part) =>
      part.type === 'text' && part.state === 'streaming' ? { ...part, state: 'done' } : part,
    ),
  }))
}
